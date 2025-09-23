import { useCallback, useEffect, useRef, useState } from 'react';
import { useTextStream } from './text';
import { DefaultTextGenerationModel } from '../common';
import { Message, ModelByCapability, ModelIf, ModelInputs } from '../../common';

type ChatModel = ModelIf<ModelByCapability<'text-generation'>, 'streamable'>;

export interface UseChatOptions<
  M extends ChatModel = typeof DefaultTextGenerationModel,
> {
  initialMessages?: Message[];
  systemPrompt?: string;
  model?: M;
  defaultInputs?: Omit<ModelInputs<M>, 'messages'>;
  retryCount?: number;
  timeoutMs?: number;
  onAbort?: () => void;
}

export function useChat<
  M extends ChatModel = typeof DefaultTextGenerationModel,
>(options: UseChatOptions<M> = {}) {
  const [messages, setMessages] = useState<Message[]>(
    options.initialMessages || []
  );
  const [partialMessage, setPartialMessage] = useState<Message | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const isMountedRef = useRef(true);
  const currentRequestIdRef = useRef<string | null>(null);
  const retryTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onAbortRef = useRef(options.onAbort);

  useEffect(() => {
    onAbortRef.current = options.onAbort;
  }, [options.onAbort]);

  const { stream, abort: streamAbort } = useTextStream(
    {
      model: options.model,
      messages: [],
      ...options.defaultInputs,
    },
    { accumulate: false }
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const prepareInputs = useCallback(
    (userMessage?: Message): ModelInputs<M> => {
      const inputMessages: Message[] = [];
      if (options.systemPrompt) {
        inputMessages.push({ role: 'system', content: options.systemPrompt });
      }
      inputMessages.push(...messages);
      if (userMessage) {
        inputMessages.push(userMessage);
      }
      return { messages: inputMessages };
    },
    [messages, options.systemPrompt]
  );

  const sendMessage = useCallback(
    async (
      userInput: string,
      customOptions?: Partial<ModelInputs<M>>,
      attempt = 0
    ) => {
      if (!userInput.trim()) return;
      if (isSending && attempt === 0) return;

      setIsSending(true);
      setError(null);

      const requestId = `${Date.now()}-${attempt}`;
      currentRequestIdRef.current = requestId;

      const userMessage: Message = { role: 'user', content: userInput };
      const addingUserMessage = attempt === 0;
      if (addingUserMessage) setMessages(prev => [...prev, userMessage]);

      const partial: Message = { role: 'assistant', content: '' };
      setPartialMessage(partial);

      let receivedAny = false;
      let assistantContent = '';

      const timeoutId = options.timeoutMs
        ? setTimeout(() => {
            streamAbort();
          }, options.timeoutMs)
        : null;

      let completed = false;
      try {
        const inputs = prepareInputs(
          addingUserMessage ? userMessage : undefined
        );
        for await (const event of stream({
          model: options.model,
          ...customOptions,
          ...inputs,
        })) {
          if (
            !isMountedRef.current ||
            currentRequestIdRef.current !== requestId
          )
            break;
          if (event.type === 'message' && event.role === 'assistant') {
            receivedAny = true;
            assistantContent += event.content;
            setPartialMessage({ role: 'assistant', content: assistantContent });
          }
        }
        if (isMountedRef.current && currentRequestIdRef.current === requestId) {
          if (assistantContent.length > 0) {
            setMessages(prev => [
              ...prev,
              { role: 'assistant', content: assistantContent },
            ]);
            completed = true;
          } else if (!receivedAny) {
            throw new Error('NO_OUTPUT');
          }
        }
      } catch (e: any) {
        if (!isMountedRef.current || currentRequestIdRef.current !== requestId)
          return;
        if (e.name === 'AbortError') {
          if (onAbortRef.current) {
            onAbortRef.current();
          }
        } else {
          setError(e as Error);
          if (!receivedAny && attempt === 0) {
            setMessages(prev => prev.slice(0, -1));
          }
          if (attempt < (options.retryCount || 0)) {
            const backoffMs = 750 * (attempt + 1);
            const t = setTimeout(
              () => sendMessage(userInput, customOptions, attempt + 1),
              backoffMs
            );
            retryTimersRef.current.push(t);
          }
        }
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
        if (isMountedRef.current && currentRequestIdRef.current === requestId) {
          setIsSending(false);
          if (completed) {
            setPartialMessage(null);
          }
        }
        if (currentRequestIdRef.current === requestId) {
          currentRequestIdRef.current = null;
        }
      }
    },
    [
      isSending,
      stream,
      prepareInputs,
      options.model,
      options.retryCount,
      options.timeoutMs,
    ]
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    setPartialMessage(null);
    setError(null);
  }, []);

  const chatAbort = useCallback(() => {
    streamAbort();
    if (isMountedRef.current && currentRequestIdRef.current) {
      setIsSending(false);
      setPartialMessage(null);
      if (onAbortRef.current) {
        onAbortRef.current();
      }
      currentRequestIdRef.current = null;
    }
  }, [streamAbort]);

  useEffect(() => {
    return () => {
      chatAbort();
      retryTimersRef.current.forEach(clearTimeout);
      retryTimersRef.current = [];
    };
  }, [chatAbort]);

  return {
    messages,
    partialMessage,
    isSending,
    error,
    sendMessage,
    clear: clearChat,
    abort: chatAbort,
  };
}
