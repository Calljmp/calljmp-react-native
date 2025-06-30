import {
  DotPaths,
  ProjectedType,
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

export type RealtimeTopic = string;

export interface RealtimeTopicHandler<Data = {}> {
  (topic: RealtimeTopic, data: Data): Promise<void> | void;
}

export interface RealtimeSubscription {
  readonly topic: RealtimeTopic;
  readonly active: boolean;

  unsubscribe: () => Promise<void>;
}

interface RealtimeSubscribeOptions<Data> {
  topic: RealtimeTopic;
  fields?: string[];
  filter?: SignalFilter;
  onData?: RealtimeTopicHandler<Data>;
}

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

    const handleData = async (message: SignalMessageData) => {
      if (subscription.active && message.topic === options.topic) {
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
