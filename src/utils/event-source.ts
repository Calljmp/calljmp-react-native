export type EventType = 'open' | 'data' | 'error' | 'close';

export interface DataEvent<T = Record<string, unknown>> {
  type: 'data';
  data: T;
}
export interface OpenEvent {
  type: 'open';
}
export interface CloseEvent {
  type: 'close';
}
export interface TimeoutEvent {
  type: 'timeout';
}
export interface ErrorEvent {
  type: 'error';
  message: string;
  xhrState: number;
  xhrStatus: number;
}
export interface ExceptionEvent {
  type: 'exception';
  message: string;
  error: Error;
}

export interface EventSourceOptions {
  method?: string;
  timeout?: number; // overall xhr timeout (ms)
  timeoutBeforeConnection?: number; // initial delay before first attempt (ms)
  withCredentials?: boolean;
  headers?: Record<string, string>;
  body?: any;
  pollingInterval?: number; // reconnection delay (ms)
  lineEndingCharacter?: string; // override auto-detection (\r\n | \n | \r | custom)
}

export type Event =
  | DataEvent
  | OpenEvent
  | CloseEvent
  | ErrorEvent
  | TimeoutEvent
  | ExceptionEvent;

export type EventWithType<E extends EventType, T = unknown> = E extends 'open'
  ? OpenEvent
  : E extends 'data'
    ? DataEvent<T>
    : E extends 'error'
      ? ErrorEvent | TimeoutEvent | ExceptionEvent
      : E extends 'close'
        ? CloseEvent
        : never;

export type EventSourceListener<E extends EventType, T = unknown> = (
  event: EventWithType<E, T>
) => void;

type HandlerStore = {
  open: Array<EventSourceListener<'open'>>;
  data: Array<EventSourceListener<'data'>>;
  error: Array<EventSourceListener<'error'>>;
  close: Array<EventSourceListener<'close'>>;
};

interface ParseAccumulator {
  type?: string;
  id: string | null;
  data: string[];
}

class EventSource {
  readonly ERROR = -1 as const;
  readonly CONNECTING = 0 as const;
  readonly OPEN = 1 as const;
  readonly CLOSED = 2 as const;

  // newline variants
  private readonly CRLF = '\r\n';
  private readonly LF = '\n';
  private readonly CR = '\r';

  // configuration
  private readonly method: string;
  private readonly timeout: number;
  private readonly timeoutBeforeConnection: number;
  private readonly withCredentials: boolean;
  private readonly headers: Record<string, string>;
  private readonly body: any;
  private _lineEndingCharacter: string | null;

  private _interval: number; // reconnection interval (can be updated via 'retry')

  private _xhr: XMLHttpRequest | null = null;
  private _pollTimer: ReturnType<typeof setTimeout> | null = null;
  private _lastIndexProcessed = 0;

  readonly url: string;
  lastEventId: string | null = null;
  status: number = this.CONNECTING;

  private readonly _eventHandlers: HandlerStore = {
    open: [],
    data: [],
    error: [],
    close: [],
  };

  constructor(url: URL | string, options: EventSourceOptions = {}) {
    if (
      !url ||
      (typeof url !== 'string' && typeof (url as any).toString !== 'function')
    ) {
      throw new SyntaxError('[EventSource] Invalid URL argument.');
    }

    this.url = typeof url === 'string' ? url : url.toString();

    this.method = options.method ?? 'GET';
    this.timeout = options.timeout ?? 0;
    this.timeoutBeforeConnection = options.timeoutBeforeConnection ?? 500;
    this.withCredentials = options.withCredentials ?? false;
    this.headers = options.headers ?? {};
    this.body = options.body;
    this._interval = options.pollingInterval ?? 5000;
    this._lineEndingCharacter = options.lineEndingCharacter ?? null;

    this._pollAgain(this.timeoutBeforeConnection, true);
  }

  open(): void {
    try {
      this.status = this.CONNECTING;
      this._lastIndexProcessed = 0;

      const xhr = new XMLHttpRequest();
      this._xhr = xhr;
      xhr.open(this.method, this.url, true);

      if (this.withCredentials) {
        xhr.withCredentials = true;
      }

      xhr.setRequestHeader('Accept', 'text/event-stream');
      xhr.setRequestHeader('Cache-Control', 'no-cache');
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

      for (const [key, value] of Object.entries(this.headers)) {
        xhr.setRequestHeader(key, value);
      }

      if (this.lastEventId !== null) {
        xhr.setRequestHeader('Last-Event-ID', this.lastEventId);
      }

      xhr.timeout = this.timeout;

      xhr.onreadystatechange = () => this._handleReadyStateChange();
      xhr.onerror = () => this._handleXHRError();

      if (this.body !== undefined) {
        xhr.send(this.body);
      } else {
        xhr.send();
      }

      if (this.timeout > 0) {
        setTimeout(() => {
          if (this._xhr && this._xhr.readyState === XMLHttpRequest.LOADING) {
            this.dispatch('error', { type: 'timeout' } satisfies TimeoutEvent);
            this.close();
          }
        }, this.timeout);
      }
    } catch (e) {
      const err = e as Error;
      this.status = this.ERROR;
      this.dispatch('error', {
        type: 'exception',
        message: err.message,
        error: err,
      } satisfies ExceptionEvent);
    }
  }

  close(): void {
    if (this.status !== this.CLOSED) {
      this.status = this.CLOSED;
      this.dispatch('close', { type: 'close' });
    }

    if (this._pollTimer) {
      clearTimeout(this._pollTimer);
      this._pollTimer = null;
    }
    if (this._xhr) {
      this._xhr.abort();
    }
  }

  addEventListener<T extends EventType, K>(
    type: T,
    listener: EventSourceListener<T, K>
  ): void {
    this._eventHandlers[type].push(listener as any);
  }

  removeEventListener<T extends EventType, K>(
    type: T,
    listener: EventSourceListener<T, K>
  ): void {
    this._eventHandlers[type] = this._eventHandlers[type].filter(
      h => h !== listener
    ) as any;
  }

  removeAllEventListeners(type?: EventType): void {
    if (type === undefined) {
      this._eventHandlers.open = [];
      this._eventHandlers.data = [];
      this._eventHandlers.error = [];
      this._eventHandlers.close = [];
      return;
    }
    this._eventHandlers[type] = [];
  }

  dispatch<E extends EventType>(type: E, data: EventWithType<E>): void {
    const handlers = this._eventHandlers[type];
    if (!handlers.length) return;
    for (const handler of handlers) {
      handler(data as any);
    }
  }

  private _pollAgain(time: number, allowZero: boolean): void {
    if (time > 0 || allowZero) {
      this._pollTimer = setTimeout(() => this.open(), time);
    }
  }

  private _handleReadyStateChange(): void {
    if (!this._xhr || this.status === this.CLOSED) return;
    const xhr = this._xhr;
    if (
      ![XMLHttpRequest.DONE, XMLHttpRequest.LOADING].includes(
        xhr.readyState as any
      )
    )
      return;

    if (xhr.status >= 200 && xhr.status < 400) {
      if (this.status === this.CONNECTING) {
        this.status = this.OPEN;
        this.dispatch('open', { type: 'open' });
      }
      this._processIncoming(xhr.responseText || '');
      if (xhr.readyState === XMLHttpRequest.DONE) {
        this._pollAgain(this._interval, false);
      }
    } else if (xhr.status !== 0) {
      this.status = this.ERROR;
      this.dispatch('error', {
        type: 'error',
        message: xhr.responseText,
        xhrStatus: xhr.status,
        xhrState: xhr.readyState,
      } satisfies ErrorEvent);
      if (xhr.readyState === XMLHttpRequest.DONE) {
        this._pollAgain(this._interval, false);
      }
    }
  }

  private _handleXHRError(): void {
    if (!this._xhr || this.status === this.CLOSED) return;
    const xhr = this._xhr;
    this.status = this.ERROR;
    this.dispatch('error', {
      type: 'error',
      message: xhr.responseText,
      xhrStatus: xhr.status,
      xhrState: xhr.readyState,
    } satisfies ErrorEvent);
  }

  private _processIncoming(response: string): void {
    if (this._lineEndingCharacter === null) {
      const detected = this._detectNewlineChar(response);
      if (detected) {
        this._lineEndingCharacter = detected;
      }
    }

    const indexOfDoubleNewline = this._getLastDoubleNewlineIndex(response);
    if (indexOfDoubleNewline <= this._lastIndexProcessed) return;

    const slice = response.substring(
      this._lastIndexProcessed,
      indexOfDoubleNewline
    );
    const parts = slice.split(this._lineEndingCharacter!);
    this._lastIndexProcessed = indexOfDoubleNewline;

    const acc: ParseAccumulator = { id: null, data: [] };

    for (let i = 0; i < parts.length; i++) {
      const rawLine = parts[i];
      const line = rawLine.trim();
      if (line.startsWith('event')) {
        acc.type = line.replace(/event:?\s*/, '');
      } else if (line.startsWith('retry')) {
        const retry = parseInt(line.replace(/retry:?\s*/, ''), 10);
        if (!Number.isNaN(retry)) this._interval = retry;
      } else if (line.startsWith('data')) {
        acc.data.push(line.replace(/data:?\s*/, ''));
      } else if (line.startsWith('id')) {
        const id = line.replace(/id:?\s*/, '');
        this.lastEventId = id !== '' ? id : null;
        acc.id = this.lastEventId;
      } else if (line === '') {
        this._flushEvent(acc);
      }
    }
  }

  private _flushEvent(acc: ParseAccumulator): void {
    if (!acc.data.length) return;
    const eventType = (acc.type || 'data') as EventType;
    if (eventType === 'data') {
      this.dispatch(eventType, {
        type: 'data',
        data: JSON.parse(acc.data.join('')),
      });
    } else if (eventType === 'open') {
      this.dispatch(eventType, { type: 'open' });
    } else if (eventType === 'close') {
      this.dispatch(eventType, { type: 'close' });
    } else if (eventType === 'error') {
      this.dispatch(eventType, {
        type: 'error',
        message: acc.data.join('\n'),
        xhrStatus: this.status,
        xhrState: 0,
      });
    }
    acc.type = undefined;
    acc.data = [];
  }

  private _detectNewlineChar(response: string): string | null {
    for (const ch of [this.CRLF, this.LF, this.CR]) {
      if (response.includes(ch)) return ch;
    }
    return null;
  }

  private _getLastDoubleNewlineIndex(response: string): number {
    if (!this._lineEndingCharacter) return -1;
    const dbl = this._lineEndingCharacter + this._lineEndingCharacter;
    const idx = response.lastIndexOf(dbl);
    return idx === -1 ? -1 : idx + dbl.length;
  }
}

export default EventSource;
