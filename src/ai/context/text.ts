import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ModelByCapability,
  ModelIf,
  ModelInputs,
  ModelOutputs,
} from '../../common';
import { useCalljmp } from '../../context';
import { DefaultTextGenerationModel, TextStreamEvent } from '../common';

interface HookOptions {
  retryCount?: number;
  timeoutMs?: number;
  onAbort?: () => void;
}

export function useTextGeneration<
  M extends
    ModelByCapability<'text-generation'> = typeof DefaultTextGenerationModel,
>(
  initialOptions?: { model?: M; prompt?: string } & ModelInputs<M>,
  { retryCount = 0, timeoutMs, onAbort }: HookOptions = {}
) {
  const [result, setResult] = useState<ModelOutputs<M> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  const currentRequestIdRef = useRef<string | null>(null);
  const initialOptionsRef = useRef(initialOptions);
  const onAbortRef = useRef(onAbort);

  useEffect(() => {
    initialOptionsRef.current = initialOptions;
    onAbortRef.current = onAbort;
  }, [initialOptions, onAbort]);

  const { client } = useCalljmp();

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const generate = useCallback(
    async (options: { model?: M } & ModelInputs<M>, retry = 0) => {
      console.log('useTextGeneration: Starting generation', { options, retry });
      setLoading(true);
      setError(null);
      setResult(null);
      abortControllerRef.current?.abort();

      const requestId = Date.now().toString();
      currentRequestIdRef.current = requestId;

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const timeoutId = timeoutMs
        ? setTimeout(() => controller.abort(), timeoutMs)
        : null;

      try {
        const response = await client.ai.generateText({
          ...initialOptionsRef.current,
          ...options,
          signal: controller.signal,
        });
        if (isMountedRef.current && currentRequestIdRef.current === requestId) {
          if (response.error) {
            console.log('useTextGeneration: Error in response', response.error);
            setError(response.error);
          } else {
            console.log('useTextGeneration: Success', response.data);
            setResult(response.data);
          }
        }
        return response;
      } catch (e: any) {
        console.log('useTextGeneration: Caught error', e);
        if (isMountedRef.current && currentRequestIdRef.current === requestId) {
          if (e.name !== 'AbortError') {
            setError(e as Error);
          } else if (onAbortRef.current) {
            onAbortRef.current();
          }
        }
        if (retry < retryCount && e.name !== 'AbortError') {
          console.log('useTextGeneration: Retrying', { retry: retry + 1 });
          await new Promise(resolve => setTimeout(resolve, 1000 * (retry + 1)));
          return generate(options, retry + 1);
        }
        return { error: e as Error, data: undefined };
      } finally {
        console.log('useTextGeneration: Finishing generation');
        if (isMountedRef.current && currentRequestIdRef.current === requestId) {
          if (timeoutId) clearTimeout(timeoutId);
          setLoading(false);
        }
        if (currentRequestIdRef.current === requestId) {
          currentRequestIdRef.current = null;
        }
        abortControllerRef.current = null;
      }
    },
    [client.ai.generateText, timeoutMs, retryCount]
  );

  const abort = useCallback(() => {
    console.log('useTextGeneration: Aborting');
    abortControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    const prompt = initialOptionsRef.current?.prompt;
    if (!prompt) {
      return;
    }
    console.log('useTextGeneration: Auto-generating with initial prompt');
    generate({ prompt });
  }, [generate]);

  useEffect(() => {
    return () => abort();
  }, [abort]);

  return { result, loading, error, generate, abort };
}

export function useTextStream<
  M extends ModelIf<
    ModelByCapability<'text-generation'>,
    'streamable'
  > = typeof DefaultTextGenerationModel,
>(
  initialOptions?: { model?: M; prompt?: string } & ModelInputs<M>,
  {
    accumulate = true,
    timeoutMs,
    onAbort,
  }: { accumulate?: boolean } & Omit<HookOptions, 'retryCount'> = {}
) {
  const [streamData, setStreamData] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  const currentRequestIdRef = useRef<string | null>(null);
  const initialOptionsRef = useRef(initialOptions);
  const onAbortRef = useRef(onAbort);

  useEffect(() => {
    initialOptionsRef.current = initialOptions;
    onAbortRef.current = onAbort;
  }, [initialOptions, onAbort]);

  const { client } = useCalljmp();

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const stream = useCallback(
    async function* (
      options: { model?: M } & ModelInputs<M>
    ): AsyncGenerator<TextStreamEvent, void, unknown> {
      setLoading(true);
      setError(null);
      if (accumulate) setStreamData('');
      abortControllerRef.current?.abort();

      const requestId = Date.now().toString();
      currentRequestIdRef.current = requestId;

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const timeoutId = timeoutMs
        ? setTimeout(() => controller.abort(), timeoutMs)
        : null;

      try {
        const iterator = client.ai.streamText({
          ...initialOptionsRef.current,
          ...options,
        });
        for await (const event of iterator) {
          if (
            !isMountedRef.current ||
            currentRequestIdRef.current !== requestId ||
            controller.signal.aborted
          ) {
            break;
          }
          yield event;
          if (accumulate && event.type === 'message') {
            setStreamData(prev => prev + event.content);
          }
        }
      } catch (e: any) {
        if (isMountedRef.current && currentRequestIdRef.current === requestId) {
          if (e.name !== 'AbortError') {
            setError(e as Error);
          } else if (onAbortRef.current) {
            onAbortRef.current();
          }
        }
        throw e;
      } finally {
        if (isMountedRef.current && currentRequestIdRef.current === requestId) {
          if (timeoutId) clearTimeout(timeoutId);
          setLoading(false);
        }
        if (currentRequestIdRef.current === requestId) {
          currentRequestIdRef.current = null;
        }
        abortControllerRef.current = null;
      }
    },
    [client.ai.streamText, accumulate, timeoutMs]
  );

  const streamOnce = useCallback(
    async (options: { model?: M } & ModelInputs<M>) => {
      let lastMessage = '';
      for await (const event of stream(options)) {
        if (accumulate && event.type === 'message') {
          lastMessage += event.content;
        }
      }
      return accumulate ? lastMessage : undefined;
    },
    [stream, accumulate]
  );

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    const prompt = initialOptionsRef.current?.prompt;
    if (!prompt) {
      return;
    }
    if (accumulate) {
      streamOnce({ prompt });
    } else {
      (async () => {
        for await (const _ of stream({ prompt })) {
          // consume
        }
      })();
    }
  }, [streamOnce, stream, accumulate]);

  useEffect(() => () => abort(), [abort]);

  return { streamData, loading, error, stream, streamOnce, abort };
}
