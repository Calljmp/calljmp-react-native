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

  const { client } = useCalljmp();

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const generate = useCallback(
    async (options: { model?: M } & ModelInputs<M>, retry = 0) => {
      if (loading && retry === 0)
        return {
          error: new Error('CONCURRENT'),
          data: undefined,
        };
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
          ...initialOptions,
          ...options,
          signal: controller.signal,
        });
        if (isMountedRef.current && currentRequestIdRef.current === requestId) {
          if (response.error) {
            setError(response.error);
          } else {
            setResult(response.data);
          }
        }
        return response;
      } catch (e: any) {
        if (isMountedRef.current && currentRequestIdRef.current === requestId) {
          if (e.name !== 'AbortError') {
            setError(e as Error);
          } else if (onAbort) {
            onAbort();
          }
        }
        if (retry < retryCount && e.name !== 'AbortError') {
          await new Promise(resolve => setTimeout(resolve, 1000 * (retry + 1)));
          return generate(options, retry + 1);
        }
        return {
          error: e as Error,
          data: undefined,
        };
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
    [client.ai, initialOptions, loading, timeoutMs, onAbort, retryCount]
  );

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    if (initialOptions?.prompt && !loading) {
      generate({ prompt: initialOptions.prompt });
    }
  }, [generate, initialOptions?.prompt, loading]);

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
      if (loading) return;
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
          ...initialOptions,
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
          } else if (onAbort) {
            onAbort();
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
    [client.ai, initialOptions, accumulate, loading, timeoutMs, onAbort]
  );

  const streamOnce = useCallback(
    async (options: { model?: M } & ModelInputs<M>) => {
      for await (const _ of stream(options)) {
        // consume
      }
      return accumulate ? streamData : undefined;
    },
    [stream, streamData, accumulate]
  );

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    if (initialOptions?.prompt && !loading) {
      if (accumulate) {
        streamOnce({ prompt: initialOptions.prompt });
      } else {
        stream({ prompt: initialOptions.prompt });
      }
    }
  }, [stream, streamOnce, initialOptions?.prompt, loading, accumulate]);

  useEffect(() => {
    return () => abort();
  }, [abort]);

  return {
    streamData,
    loading,
    error,
    stream,
    streamOnce,
    abort,
  };
}
