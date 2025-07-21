import { SignalMessage, SignalMessageType } from './common';
import { Config } from './config';
import { uuid } from './crypto';
import { SecureStore } from './secure-store';
import { makeContext } from './middleware/context';
import { makeAccess } from './middleware/access';

/**
 * Signal result options for controlling handler behavior
 * @public
 */
export interface SignalResultOptions {
  /** Whether the message was handled and should stop propagation */
  handled?: boolean;
  /** Whether the handler should be automatically removed after execution */
  autoRemove?: boolean;
}

/**
 * Result returned by signal message handlers to control execution flow
 * @public
 */
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

/**
 * Handler for signal messages
 * @public
 */
export interface SignalMessageHandler<
  Message extends SignalMessage = SignalMessage,
> {
  (message: Message): Promise<SignalResult | void> | SignalResult | void;
}

/**
 * Signal lock for managing component-specific connections
 * @public
 */
export interface SignalLock {
  /** Unique identifier for the lock */
  id: string;
  /** Component that owns the lock */
  component: string;
  /** Timestamp when the lock was created */
  timestamp: number;
}

/**
 * Main Signal class for WebSocket-based real-time communication
 *
 * The Signal class provides a WebSocket connection to the Calljmp service for real-time
 * messaging. It handles connection management, automatic reconnection, message routing,
 * and component locking to optimize connection usage.
 *
 * ## Features
 *
 * - **Automatic Connection Management**: Connects and disconnects automatically based on usage
 * - **Message Buffering**: Queues messages when disconnected and sends them when reconnected
 * - **Robust Reconnection**: Exponential backoff retry logic with configurable limits
 * - **Component Locking**: Allows multiple components to share the same connection efficiently
 * - **Concurrent Connection Safety**: Multiple connection attempts are properly coordinated
 *
 * ## Usage
 *
 * ```typescript
 * const signal = new Signal(config, secureStore);
 *
 * // Connect to the service
 * await signal.connect();
 *
 * // Register a message handler
 * signal.on('data', (message) => {
 *   console.log('Received:', message.data);
 * });
 *
 * // Send a message
 * await signal.send({
 *   type: 'publish',
 *   topic: 'chat.room1',
 *   data: { message: 'Hello World' }
 * });
 *
 * // Clean up when done
 * await signal.dispose();
 * ```
 *
 * @public
 */

export class Signal {
  private _ws: WebSocket | null = null;
  private _reconnectAttempts = 0;
  private _maxReconnectAttempts = 10;
  private _reconnectDelay = 1000;
  private _autoConnect = true;
  private _messageHandlers: Map<SignalMessageType, SignalMessageHandler[]> =
    new Map();
  private _locks: Map<string, SignalLock> = new Map();
  private _autoDisconnectTimeout: NodeJS.Timeout | null = null;
  private _autoDisconnectDelay = 60_000;
  private _connectionPromise: Promise<void> | null = null;

  constructor(
    private _config: Config,
    private _store: SecureStore
  ) {}

  /**
   * Generate a unique message ID
   * @returns A unique UUID string for message identification
   */
  static messageId() {
    return uuid();
  }

  /**
   * Connect to the Signal WebSocket endpoint
   *
   * Establishes a WebSocket connection to the Calljmp service. If multiple
   * connection attempts are made concurrently, they will all wait for the
   * same connection to complete.
   *
   * @returns Promise that resolves when connection is established
   *
   * @example
   * ```typescript
   * try {
   *   await signal.connect();
   *   console.log('Connected to Calljmp service');
   * } catch (error) {
   *   console.error('Connection failed:', error);
   * }
   * ```
   */

  async connect(): Promise<void> {
    if (this._connectionPromise) {
      return this._connectionPromise;
    }

    if (this._ws) {
      return;
    }

    this._connectionPromise = this._performConnect();

    try {
      await this._connectionPromise;
    } finally {
      this._connectionPromise = null;
    }
  }

  private async _performConnect(): Promise<void> {
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
          this._reconnectAttempts = 0;
          this._reconnectDelay = 1000;
          this._scheduleAutoDisconnect();
          resolve();
        };

        this._ws.onmessage = event => {
          this._handleMessage(event);
        };

        this._ws.onclose = event => {
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
          reject(error);
        };
      } catch (error) {
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
  }

  /**
   * Send a message through the Signal connection
   *
   * Sends a message to the Calljmp service. If auto-connect is enabled and
   * the connection is not available, it will automatically connect first.
   *
   * @param message - The message to send (id will be auto-generated if not provided)
   * @returns Promise that resolves when the message is sent
   *
   * @example
   * ```typescript
   * // Send a publish message
   * await signal.send({
   *   type: 'publish',
   *   topic: 'chat.room1',
   *   data: { message: 'Hello World', user: 'john' }
   * });
   *
   * // Send a subscribe message
   * await signal.send({
   *   type: 'subscribe',
   *   topic: 'notifications.user123',
   *   fields: ['id', 'message', 'timestamp']
   * });
   * ```
   */
  async send<Message extends SignalMessage = SignalMessage>(
    message: Omit<Message, 'id'> & { id?: string }
  ): Promise<void> {
    const msg = {
      ...message,
      id: message.id || (await Signal.messageId()),
    } as Message;

    if (this._autoConnect && !this._ws) {
      await this.connect();
    }

    this._send(msg);
  }

  private _send(message: SignalMessage) {
    if (!this._ws) {
      throw new Error('WebSocket connection is not available');
    }
    const data = JSON.stringify(message);
    this._ws.send(data);
  }

  /**
   * Check if the connection is active
   * @returns true if WebSocket is connected and ready
   */
  get connected() {
    return !!this._ws && !this._connectionPromise;
  }

  /**
   * Check if currently connecting
   * @returns true if a connection attempt is in progress
   */
  get connecting() {
    return this._connectionPromise !== null;
  }

  /**
   * Check if currently reconnecting
   * @returns true if reconnecting after a connection failure
   */
  get reconnecting() {
    return this.connecting && this._reconnectAttempts > 0;
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
    const delay = Math.min(
      this._reconnectDelay * 2 ** (this._reconnectAttempts - 1),
      30000
    );
    setTimeout(() => {
      this.connect().catch(error => {
        console.error('Reconnection failed:', error);
      });
    }, delay);
  }

  /**
   * Register a handler for a specific message type
   *
   * @param type - The message type to listen for
   * @param handler - Function to handle messages of this type
   *
   * @example
   * ```typescript
   * // Listen for data messages
   * signal.on('data', (message) => {
   *   console.log('Received data:', message.data);
   *   return SignalResult.handled; // Stop processing by other handlers
   * });
   *
   * // Listen for error messages
   * signal.on('error', (message) => {
   *   console.error('Signal error:', message.message);
   * });
   * ```
   */
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

  /**
   * Remove a handler for a specific message type
   *
   * @param type - The message type to stop listening for
   * @param handler - The specific handler function to remove
   *
   * @example
   * ```typescript
   * const handler = (message) => console.log(message);
   * signal.on('data', handler);
   *
   * // Later, remove the handler
   * signal.off('data', handler);
   * ```
   */
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

  /**
   * Find an existing lock for a component
   *
   * @param component - The component name to search for
   * @returns The lock if found, null otherwise
   *
   * @example
   * ```typescript
   * const existingLock = signal.findLock('database');
   * if (existingLock) {
   *   console.log('Database component already has a lock');
   * }
   * ```
   */
  findLock(component: string): SignalLock | null {
    for (const lock of this._locks.values()) {
      if (lock.component === component) {
        return lock;
      }
    }
    return null;
  }

  /**
   * Acquire a lock for a component
   *
   * Acquires a lock to prevent the connection from auto-disconnecting.
   * This is useful when a component needs to maintain a persistent connection.
   *
   * @param component - Name of the component acquiring the lock
   * @returns Promise that resolves to the acquired lock
   *
   * @example
   * ```typescript
   * const lock = await signal.acquireLock('realtime');
   *
   * // Use the connection...
   *
   * // Release when done
   * signal.releaseLock(lock);
   * ```
   */
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

  /**
   * Release a lock
   *
   * Releases a previously acquired lock. When all locks are released,
   * the connection will auto-disconnect after a timeout period.
   *
   * @param lock - The lock to release (can be lock object or lock ID)
   *
   * @example
   * ```typescript
   * const lock = await signal.acquireLock('database');
   *
   * // Later...
   * signal.releaseLock(lock);
   * // or
   * signal.releaseLock(lock.id);
   * ```
   */
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

  /**
   * Dispose of the Signal instance
   *
   * Properly cleans up the Signal instance by canceling any pending connections,
   * disconnecting from the service, and clearing all handlers and locks.
   * Call this when you're done using the Signal instance.
   *
   * @returns Promise that resolves when disposal is complete
   *
   * @example
   * ```typescript
   * const signal = new Signal(config, store);
   *
   * // Use signal...
   *
   * // Clean up when done
   * await signal.dispose();
   * ```
   */
  async dispose(): Promise<void> {
    // Cancel any pending connection attempt
    if (this._connectionPromise) {
      try {
        await this._connectionPromise;
      } catch {
        // Ignore connection errors during disposal
      }
      this._connectionPromise = null;
    }

    await this._disconnect();
    this._messageHandlers.clear();
    this._locks.clear();
    this._clearAutoDisconnect();
  }
}
