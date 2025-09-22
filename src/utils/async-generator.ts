export interface AsyncGeneratorController<T> {
  push(value: T): void;
  end(): void;
  error(err: unknown): void;
  abort(): void;
  readonly closed: boolean;
  readonly size: number;
}

export interface CreateAsyncGeneratorOptions {
  /** Optional max buffer size; push() beyond this will throw (default: unlimited). */
  highWaterMark?: number;
}

const asyncGenerator = <T>(options: CreateAsyncGeneratorOptions = {}) => {
  const { highWaterMark } = options;
  const queue: T[] = [];
  const waiters: Array<() => void> = [];
  let closed = false;
  let errorValue: unknown | null = null;

  const wakeAll = () => {
    while (waiters.length) waiters.shift()!();
  };

  const generator = (async function* () {
    try {
      for (;;) {
        if (errorValue !== null) throw errorValue;
        if (queue.length) {
          const value = queue.shift()!;
          yield value;
          continue;
        }
        if (closed) break;
        await new Promise<void>(resolve => waiters.push(resolve));
      }
    } finally {
      closed = true;
      queue.length = 0;
      wakeAll();
    }
  })();

  const controller: AsyncGeneratorController<T> = {
    push(value: T) {
      if (closed || errorValue !== null) return;
      if (
        typeof highWaterMark === 'number' &&
        highWaterMark >= 0 &&
        queue.length >= highWaterMark &&
        waiters.length === 0
      ) {
        throw new Error(
          `[asyncGenerator] Buffer overflow (highWaterMark=${highWaterMark}).`
        );
      }
      if (waiters.length) {
        const resolve = waiters.shift()!;
        queue.push(value);
        resolve();
      } else {
        queue.push(value);
      }
    },
    end() {
      if (closed) return;
      closed = true;
      wakeAll();
    },
    error(err: unknown) {
      if (closed || errorValue !== null) return;
      errorValue = err ?? new Error('[asyncGenerator] Unknown error');
      closed = true;
      wakeAll();
    },
    abort() {
      this.end();
    },
    get closed() {
      return closed;
    },
    get size() {
      return queue.length;
    },
  };

  return { generator, controller };
};

export default asyncGenerator;
