import {
  DotPaths,
  ProjectedType,
  SignalDatabaseDelete,
  SignalDatabaseInsert,
  SignalDatabaseUpdate,
  SignalFilter,
  SignalMessageAck,
  SignalMessageData,
  SignalMessageError,
  SignalMessagePublish,
  SignalMessageSubscribe,
  SignalMessageType,
  SignalMessageUnsubscribe,
} from './common';
import { Signal, SignalLock, SignalResult } from './signal';

/**
 * Topic identifier for realtime messaging
 * @public
 */
export type RealtimeTopic = string;

/**
 * Handler function for realtime topic data
 * @public
 */
export interface RealtimeTopicHandler<Data = {}> {
  (topic: RealtimeTopic, data: Data): Promise<void> | void;
}

/**
 * Represents an active realtime subscription
 * @public
 */
export interface RealtimeSubscription {
  /** The topic this subscription is listening to */
  readonly topic: RealtimeTopic;
  /** Whether the subscription is currently active */
  readonly active: boolean;

  /** Unsubscribe from the topic */
  unsubscribe: () => Promise<void>;
}

/**
 * Options for subscribing to a realtime topic
 * @public
 */
interface RealtimeSubscribeOptions<Data> {
  /** The topic to subscribe to */
  topic: RealtimeTopic;
  /** Fields to include in the data projection */
  fields?: string[];
  /** Filter to apply to incoming data */
  filter?: SignalFilter;
  /** Handler for incoming data */
  onData?: RealtimeTopicHandler<Data>;
}

/**
 * Function signature for subscribing to realtime topics
 * @public
 */
interface RealtimeSubscribe<Data> {
  (options: RealtimeSubscribeOptions<Data>): Promise<RealtimeSubscription>;
}

const RealtimeComponent = 'realtime';

class RealtimeSubscriptionInternal implements RealtimeSubscription {
  private _active = true;
  private _unsubscribe: (() => Promise<void>) | null = null;

  constructor(public readonly topic: RealtimeTopic) {}

  set active(value: boolean) {
    this._active = value;
  }

  get active() {
    return this._active;
  }

  set onUnsubscribe(fn: () => Promise<void>) {
    this._unsubscribe = fn;
  }

  unsubscribe = async () => {
    if (this._active) {
      this._active = false;
      if (this._unsubscribe) {
        await this._unsubscribe();
      }
    }
  };
}

/**
 * Main Realtime class for pub/sub messaging
 *
 * The Realtime class provides real-time publish/subscribe messaging capabilities
 * using WebSocket connections. It allows publishing data to topics and subscribing
 * to receive real-time updates from specific topics with optional filtering.
 *
 * ## Features
 *
 * - **Topic-based messaging**: Publish and subscribe to named topics
 * - **Field projection**: Subscribe to only specific fields of the data
 * - **Real-time filtering**: Apply filters to subscriptions for targeted data
 * - **Automatic connection management**: Manages Signal connection lifecycle
 * - **Type safety**: Full TypeScript support with generic types
 *
 * ## Usage
 *
 * ```typescript
 * const realtime = new Realtime(signal);
 *
 * // Publish data to a topic
 * await realtime.publish({
 *   topic: 'chat.room1',
 *   data: { message: 'Hello World', user: 'john' }
 * });
 *
 * // Subscribe to a topic
 * const subscription = await realtime.subscribe({
 *   topic: 'chat.room1',
 *   onData: (topic, data) => {
 *     console.log('New message:', data);
 *   }
 * });
 *
 * // Unsubscribe when done
 * await subscription.unsubscribe();
 * ```
 *
 * @public
 */
export class Realtime {
  private _signalLock: SignalLock | null = null;
  private _subscriptions: Array<RealtimeSubscriptionInternal> = [];

  constructor(private _signal: Signal) {}

  private async _acquireSignalLock() {
    if (!this._signalLock) {
      this._signalLock =
        this._signal.findLock(RealtimeComponent) ||
        (await this._signal.acquireLock(RealtimeComponent));
    }
  }

  private async _releaseSignalLock() {
    if (this._signalLock) {
      this._signal.releaseLock(this._signalLock);
      this._signalLock = null;
    }
  }

  /**
   * Publish data to a real-time topic
   *
   * Sends data to all subscribers of the specified topic. The data will be
   * broadcast to all active subscriptions matching the topic.
   *
   * @param options - Publishing options
   * @param options.topic - The topic to publish to
   * @param options.data - The data to publish
   *
   * @example
   * ```typescript
   * // Publish a chat message
   * await realtime.publish({
   *   topic: 'chat.room1',
   *   data: {
   *     message: 'Hello everyone!',
   *     user: 'john',
   *     timestamp: Date.now()
   *   }
   * });
   *
   * // Publish system notification
   * await realtime.publish({
   *   topic: 'notifications.system',
   *   data: { type: 'maintenance', message: 'System will be down for 5 minutes' }
   * });
   * ```
   */
  async publish<T = unknown>({
    topic,
    data,
  }: {
    topic: RealtimeTopic;
    data: T;
  }) {
    await this._signal.send<SignalMessagePublish>({
      type: SignalMessageType.Publish,
      topic,
      data: data as Record<string, unknown>,
    });
  }

  /**
   * Unsubscribe from a specific topic
   *
   * Removes an active subscription for the specified topic.
   *
   * @param options - Unsubscribe options
   * @param options.topic - The topic to unsubscribe from (optional)
   *
   * @example
   * ```typescript
   * // Unsubscribe from a specific topic
   * await realtime.unsubscribe({ topic: 'chat.room1' });
   * ```
   */
  async unsubscribe(options: { topic?: RealtimeTopic }) {
    if (options.topic) {
      const subscription = this._subscriptions.find(
        sub => sub.topic === options.topic
      );
      if (subscription) {
        await subscription.unsubscribe();
      }
    }
  }

  /**
   * Observe real-time data for a specific topic with type safety
   *
   * Creates a RealtimeObserver that allows you to set up subscriptions
   * with field projection, filtering, and typed data handling.
   *
   * @param topic - The topic to observe
   * @returns A RealtimeObserver for configuring the subscription
   */
  observe<T = unknown>(topic: RealtimeTopic) {
    return new RealtimeObserver<T>(this._subscribe.bind(this), topic);
  }

  private async _subscribe<T>(options: RealtimeSubscribeOptions<T>) {
    const subscriptionId = await Signal.messageId();
    const subscription = new RealtimeSubscriptionInternal(options.topic);
    this._subscriptions.push(subscription);

    const removeSubscription = async () => {
      this._signal.off(SignalMessageType.Ack, handleAck);
      this._signal.off(SignalMessageType.Error, handleError);
      this._signal.off(SignalMessageType.Data, handleData);

      subscription.active = false;
      this._subscriptions = this._subscriptions.filter(
        sub => sub !== subscription
      );

      if (this._subscriptions.length === 0) {
        await this._releaseSignalLock();
      }
    };

    const unsubscribe = async () => {
      await this._signal
        .send<SignalMessageUnsubscribe>({
          type: SignalMessageType.Unsubscribe,
          topic: options.topic,
        })
        .catch(error => {
          console.error(
            `Failed to unsubscribe from topic ${options.topic}:`,
            error
          );
        });
    };

    const handleData = async (
      message:
        | SignalMessageData
        | SignalDatabaseInsert
        | SignalDatabaseUpdate
        | SignalDatabaseDelete
    ) => {
      if (
        subscription.active &&
        message.topic === options.topic &&
        'data' in message
      ) {
        try {
          await options.onData?.(
            message.topic as RealtimeTopic,
            message.data as T
          );
        } catch (error) {
          console.error(
            `Error handling data for topic ${message.topic}:`,
            error
          );
        }
      }
    };

    const handleAck = async (message: SignalMessageAck) => {
      if (message.id !== subscriptionId) return;
      this._signal.off(SignalMessageType.Ack, handleAck);
      this._signal.off(SignalMessageType.Error, handleError);
      return SignalResult.handled;
    };

    const handleError = async (message: SignalMessageError) => {
      if (message.id !== subscriptionId) return;
      await removeSubscription();
      return SignalResult.handled;
    };

    subscription.onUnsubscribe = async () => {
      await unsubscribe();
      await removeSubscription();
    };

    this._signal.on(SignalMessageType.Ack, handleAck);
    this._signal.on(SignalMessageType.Error, handleError);
    this._signal.on(SignalMessageType.Data, handleData);

    await this._acquireSignalLock();
    await this._signal.send<SignalMessageSubscribe>({
      type: SignalMessageType.Subscribe,
      id: subscriptionId,
      topic: options.topic,
      fields: options.fields,
      filter: options.filter,
    });

    return subscription;
  }
}

/**
 * Observer for setting up real-time subscriptions with type safety
 *
 * The RealtimeObserver provides a fluent interface for configuring
 * real-time subscriptions with field projection, filtering, and
 * event handling.
 *
 * @public
 */
class RealtimeObserver<
  T,
  const Fields extends readonly DotPaths<T>[] | undefined = undefined,
  Data = Fields extends readonly DotPaths<T>[] ? ProjectedType<T, Fields> : T,
> {
  private _fields: string[] | undefined;
  private _filter: SignalFilter<T> | undefined;
  private _dataHandler: RealtimeTopicHandler<Data> | undefined;

  constructor(
    private _subscribe: RealtimeSubscribe<Data>,
    private _topic: RealtimeTopic
  ) {}

  /**
   * Set field projection for the subscription
   *
   * Limits the data received to only the specified fields, reducing
   * bandwidth and improving performance.
   *
   * @param fields - Array of field paths to include
   * @returns The observer instance for chaining
   *
   * @example
   * ```typescript
   * realtime.observe<User>('users.updates')
   *   .fields(['name', 'email', 'profile.avatar'])
   *   .onData((topic, user) => {
   *     // user only contains name, email, and profile.avatar
   *   });
   * ```
   */
  fields<const F extends readonly DotPaths<Data>[]>(fields: F) {
    this._fields = [fields].flat();
    return this as RealtimeObserver<Data, F>;
  }

  filter(filter: SignalFilter<T>) {
    this._filter = filter;
    return this;
  }

  on(event: 'data', handler: RealtimeTopicHandler<Data>): this;
  // on(event: 'error', handler: (error: Error) => void): this;

  on(event: string, handler: any) {
    if (event === 'data') {
      this._dataHandler = handler;
    }
    return this;
  }

  async subscribe(): Promise<RealtimeSubscription> {
    return this._subscribe({
      topic: this._topic,
      fields: this._fields,
      filter: this._filter,
      onData: this._dataHandler,
    });
  }
}
