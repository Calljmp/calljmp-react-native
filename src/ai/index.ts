import {
  AgentConfig,
  AgentType,
  Message,
  Model,
  ModelByCapability,
  ModelIf,
  ModelInputs,
  ModelOutputs,
  ServiceErrorCode,
} from '../common';
import { Config } from '../config';
import { makeAccess, access, postAccess } from '../middleware/access';
import { makeContext, context } from '../middleware/context';
import { request } from '../request';
import { AccessResolver } from '../utils/access-resolver';
import EventSource, { DataEvent } from '../utils/event-source';
import asyncGenerator from '../utils/async-generator';
import { DefaultTextGenerationModel, TextStreamEvent } from './common';
import { agentMeta } from '../runtime';
import { sha256 } from '../crypto';

export type { Message, Model, ModelInputs, ModelOutputs };

export class AI {
  constructor(
    private _config: Config,
    private _access: AccessResolver
  ) {}

  private get _invokeUrl() {
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
    return request(this._invokeUrl)
      .use(context(this._config), access(this._config, this._access))
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
    const source = new EventSource(this._invokeUrl, {
      withCredentials: true,
      method: 'POST',
      headers: {
        ...makeContext(this._config),
        ...(await makeAccess(this._config, this._access)),
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
        postAccess(this._config, this._access, e.message);
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

  agent<Input, Output>(
    config: AgentConfig,
    runner: (input: Input) => Promise<Output>
  ): Agent<Input, Output> {
    return new Agent(this._config, this._access, config, runner);
  }
}

interface AgentRunner<Input, Output> {
  (input: Input): Promise<Output>;
}

class Agent<Input, Output> {
  private readonly _code: string;
  private _fingerprintInternal: string | null = null;

  constructor(
    private readonly _config: Config,
    private readonly _access: AccessResolver,
    agentConfig: AgentConfig,
    runner: AgentRunner<Input, Output>
  ) {
    const meta = agentMeta(runner);
    if (!meta) {
      throw new Error(
        `Agent ${agentConfig.name} is missing metadata. Make sure it is defined using calljmp.ai.agent().\nIf the issue persists, please double check you configured the Babel plugin (\`plugins: ['@calljmp/react-native/babel-plugin']\`) correctly.`
      );
    }
    this._code = codeTemplate({
      config: agentConfig,
      run: meta.code,
    });
  }

  private async fingerprint() {
    if (!this._fingerprintInternal) {
      this._fingerprintInternal = await sha256(
        JSON.stringify({
          code: this._code,
          type: AgentType.Ephemeral,
        }),
        'hex'
      );
    }
    return this._fingerprintInternal;
  }

  async run(input: Input) {
    const makeRequest = () =>
      request(`${this._config.serviceUrl}/ai/agent`).use(
        context(this._config),
        access(this._config, this._access)
      );

    const fingerprint = await this.fingerprint();

    // optimistically try to invoke using cached agent
    {
      const result = await makeRequest()
        .post({ id: fingerprint, input })
        .json<{ id: string }>();

      if (result.error && result.error.code === ServiceErrorCode.NotFound) {
        // cache miss, continue to deploy
      } else {
        return result;
      }
    }

    return makeRequest()
      .post({
        code: this._code,
        input,
      })
      .json<{ id: string }>();
  }
}

function codeTemplate(args: { config: AgentConfig; run: string }): string {
  return `
import { workflow, web, llm, vault } from '@calljmp/agent';
export const config = ${JSON.stringify(args.config)};
export const run = ${args.run};
`.trim();
}
