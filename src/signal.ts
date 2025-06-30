import { SignalMessage, SignalMessageType } from './common';
import { Config } from './config';
import { uuid } from './crypto';
import { SecureStore } from './secure-store';
import { makeContext } from './middleware/context';
import { makeAccess } from './middleware/access';

export interface SignalResultOptions {
  handled?: boolean;
  autoRemove?: boolean;
}

export class SignalResult {
  constructor(readonly options: SignalResultOptions = {}) {}

  static none = new SignalResult();

  static readonly handled = SignalResult.none.handled;

  get handled() {
    return new SignalResult({
      ...this.options,
      handled: true,
    });
  }

  get autoRemove() {
    return new SignalResult({
      ...this.options,
      autoRemove: true,
    });
  }
}

export interface SignalMessageHandler<
  Message extends SignalMessage = SignalMessage,
> {
  (message: Message): Promise<SignalResult | void> | SignalResult | void;
}

export interface SignalLock {
  id: string;
  component: string;
  timestamp: number;
}

export class Signal {
  private _ws: WebSocket | null = null;
  private _reconnectAttempts = 0;
  private _maxReconnectAttempts = 10;
  private _reconnectDelay = 1000;
  private _isConnecting = false;
  private _messageBuffer: SignalMessage[] = [];
  private _autoConnect = true;
  private _messageHandlers: Map<SignalMessageType, SignalMessageHandler[]> =
    new Map();
  private _locks: Map<string, SignalLock> = new Map();
  private _autoDisconnectTimeout: NodeJS.Timeout | null = null;
  private _autoDisconnectDelay = 60_000;

  constructor(
    private _config: Config,
    private _store: SecureStore
  ) {}

  static messageId() {
    return uuid();
  }

  async connect(): Promise<void> {
    if (this._ws?.readyState === WebSocket.OPEN) {
      return;
    }

    if (this._isConnecting) {
      return;
    }

    this._isConnecting = true;

    const url = this._config.serviceUrl
      .replace('http://', 'ws://')
      .replace('https://', 'wss://');
    const headers = {
      ...makeContext(this._config),
      ...(await makeAccess(this._store)),
    };

    return new Promise((resolve, reject) => {
      try {
        this._ws = new WebSocket(`${url}/signal`, undefined, { headers });

        this._ws.onopen = () => {
          this._isConnecting = false;
          this._reconnectAttempts = 0;
          this._reconnectDelay = 1000;
          this._flushMessageBuffer();
          this._scheduleAutoDisconnect();
          resolve();
        };

        this._ws.onmessage = event => {
          this._handleMessage(event);
        };

        this._ws.onclose = event => {
          this._isConnecting = false;
          this._ws = null;
          this._clearAutoDisconnect();

          // Reconnect if the connection was not closed cleanly and we haven't exceeded max attempts
          if (
            event.code !== 1000 &&
            this._reconnectAttempts < this._maxReconnectAttempts
          ) {
            this._attemptReconnect();
          }
        };

        this._ws.onerror = error => {
          this._isConnecting = false;
          reject(error);
        };
      } catch (error) {
        this._isConnecting = false;
        reject(error);
      }
    });
  }

  private async _disconnect(): Promise<void> {
    if (this._ws) {
      this._ws.close(1000, 'Client disconnect');
      this._ws = null;
    }
    this._clearAutoDisconnect();
    this._clearMessageBuffer();
  }

  async send<Message extends SignalMessage = SignalMessage>(
    message: Omit<Message, 'id'> & { id?: string }
  ): Promise<void> {
    const msg = {
      ...message,
      id: message.id || (await Signal.messageId()),
    } as Message;

    if (this._autoConnect && !this.connected && !this.connecting) {
      this._messageBuffer.push(msg);
      await this.connect();
      return;
    }

    if (this.connecting) {
      this._messageBuffer.push(msg);
      return;
    }

    this._send(msg);
  }

  private _send(message: SignalMessage) {
    if (!this._ws) {
      throw new Error('WebSocket is not initialized');
    }
    const data = JSON.stringify(message);
    this._ws.send(data);
  }

  get connected() {
    return this._ws?.readyState === WebSocket.OPEN;
  }

  get connecting() {
    return this._isConnecting;
  }

  get reconnecting() {
    return this._isConnecting && this._reconnectAttempts > 0;
  }

  private _clearMessageBuffer() {
    this._messageBuffer = [];
  }

  private _flushMessageBuffer() {
    const messagesToSend = [...this._messageBuffer];
    this._messageBuffer = [];
    for (const message of messagesToSend) {
      try {
        this._send(message);
      } catch {
        this._messageBuffer.unshift(message);
        break;
      }
    }
  }

  private async _handleMessage(event: { data?: string }) {
    if (!event.data) return;
    try {
      const message: SignalMessage = JSON.parse(event.data);
      const handlers = [...(this._messageHandlers.get(message.type) || [])];
      for (const handler of handlers) {
        const result = await handler(message);
        if (result instanceof SignalResult) {
          if (result.options.autoRemove) {
            this.off(message.type, handler);
          }
          if (result.options.handled) {
            return;
          }
        }
      }
    } catch {
      console.error('Received raw signal message:', event.data);
    }
  }

  private _attemptReconnect() {
    this._reconnectAttempts++;
    const delay =
      this._reconnectDelay * Math.pow(2, this._reconnectAttempts - 1);
    setTimeout(() => {
      this.connect().catch(error => {
        console.error('Reconnection failed:', error);
      });
    }, delay);
  }

  on<Type extends SignalMessageType>(
    type: Type,
    handler: SignalMessageHandler<Extract<SignalMessage, { type: Type }>>
  ): void {
    const handlers = this._messageHandlers.get(type) || [];
    this._messageHandlers.set(type, [
      ...handlers,
      handler as SignalMessageHandler,
    ]);
  }

  off<Type extends SignalMessageType>(
    type: Type,
    handler: SignalMessageHandler<Extract<SignalMessage, { type: Type }>>
  ): void {
    const handlers = this._messageHandlers.get(type) || [];
    this._messageHandlers.set(
      type,
      handlers.filter(h => h !== handler)
    );
  }

  findLock(component: string): SignalLock | null {
    for (const lock of this._locks.values()) {
      if (lock.component === component) {
        return lock;
      }
    }
    return null;
  }

  async acquireLock(component: string): Promise<SignalLock> {
    const lockId = await uuid();
    const lock: SignalLock = {
      id: lockId,
      component,
      timestamp: Date.now(),
    };
    this._locks.set(lockId, lock);
    this._clearAutoDisconnect();
    return lock;
  }

  releaseLock(lock: string | SignalLock): void {
    this._locks.delete(typeof lock === 'string' ? lock : lock.id);
    this._scheduleAutoDisconnect();
  }

  private _scheduleAutoDisconnect(): void {
    this._clearAutoDisconnect();

    if (this.connected && this._locks.size === 0) {
      this._autoDisconnectTimeout = setTimeout(() => {
        if (this.connected && this._locks.size === 0) {
          this._disconnect().catch(error => {
            console.error('Auto-disconnect failed:', error);
          });
        }
      }, this._autoDisconnectDelay);
    }
  }

  private _clearAutoDisconnect(): void {
    if (this._autoDisconnectTimeout) {
      clearTimeout(this._autoDisconnectTimeout);
      this._autoDisconnectTimeout = null;
    }
  }
}
