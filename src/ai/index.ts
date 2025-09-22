import {
  Message,
  Model,
  ModelByCapability,
  ModelIf,
  ModelInputs,
  ModelOutputs,
} from '../common';
import { Config } from '../config';
import { Integrity } from '../integrity';
import { makeAccess, access } from '../middleware/access';
import { makeContext, context } from '../middleware/context';
import { request } from '../request';
import { SecureStore } from '../secure-store';
import { AccessResolver } from '../utils/access-resolver';
import EventSource, { DataEvent } from '../utils/event-source';
import asyncGenerator from '../utils/async-generator';
import { DefaultTextGenerationModel, TextStreamEvent } from './common';

export type { Message, Model, ModelInputs, ModelOutputs };

export class AI {
  private readonly _access: AccessResolver;

  constructor(
    private _config: Config,
    integrity: Integrity,
    private readonly _store: SecureStore
  ) {
    this._access = new AccessResolver(integrity, this._store);
  }

  private async _resolveAccess() {
    const access = await this._access.resolve();
    return access.data?.toString() || null;
  }

  private get url() {
    return `${this._config.serviceUrl}/ai/invoke`;
  }

  async generateText<
    M extends
      ModelByCapability<'text-generation'> = typeof DefaultTextGenerationModel,
  >({
    model,
    signal,
    ...args
  }: {
    model?: M;
    signal?: AbortSignal;
  } & ModelInputs<M>) {
    return request(this.url)
      .use(
        context(this._config),
        access(this._store, () => this._resolveAccess())
      )
      .$if(!!signal, req => req.signal(signal!))
      .post({
        model: model ?? DefaultTextGenerationModel,
        ...args,
      })
      .json<ModelOutputs<M>>();
  }

  async *streamText<
    M extends ModelIf<
      ModelByCapability<'text-generation'>,
      'streamable'
    > = typeof DefaultTextGenerationModel,
  >({
    model,
    ...args
  }: {
    model?: M;
  } & ModelInputs<M>) {
    const source = new EventSource(this.url, {
      withCredentials: true,
      method: 'POST',
      headers: {
        ...makeContext(this._config),
        ...(await makeAccess(this._store)),
      },
      body: JSON.stringify({
        model: model ?? DefaultTextGenerationModel,
        stream: true,
        ...args,
      }),
    });

    type Data = ({ type: 'message' } & Message) | { type: 'done' };
    const { generator, controller } = asyncGenerator<TextStreamEvent>();

    source.addEventListener('error', e => {
      if (e.type === 'error') {
        controller.error(new Error(e.message));
      } else if (e.type === 'exception') {
        controller.error(e.error);
      } else if (e.type === 'timeout') {
        controller.error(new Error('Stream timeout'));
      } else {
        controller.error(new Error('Unknown stream error'));
      }
    });

    source.addEventListener('data', (e: DataEvent<Data>) => {
      if (e.data.type === 'message') {
        controller.push(e.data);
      } else if (e.data.type === 'done') {
        controller.end();
      }
    });
    source.addEventListener('close', () => controller.end());

    try {
      for await (const event of generator) {
        yield event;
      }
    } finally {
      source.close();
      controller.end();
    }
  }
}
