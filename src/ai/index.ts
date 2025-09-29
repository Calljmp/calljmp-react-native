import {
  Message,
  Model,
  ModelByCapability,
  ModelIf,
  ModelInputs,
  ModelOutputs,
} from '../common';
import { Config } from '../config';
import { makeAccess, access, postAccess } from '../middleware/access';
import { makeContext, context } from '../middleware/context';
import { request } from '../request';
import { AccessResolver } from '../utils/access-resolver';
import EventSource, { DataEvent } from '../utils/event-source';
import asyncGenerator from '../utils/async-generator';
import { DefaultTextGenerationModel, TextStreamEvent } from './common';
import {
  FlowBuilder,
  OperatorConfig,
  OperatorContext,
  WorkflowConfig,
  Operator,
  Workflow,
  InferInitial,
  InferOutput,
} from './workflow';

export type { Message, Model, ModelInputs, ModelOutputs };

export class AI {
  constructor(
    private _config: Config,
    private _access: AccessResolver
  ) {}

  private get _invokeUrl() {
    return `${this._config.serviceUrl}/ai/invoke`;
  }

  operator<Input, Output>(
    run: (context: OperatorContext<Input>) => Output | Promise<Output>,
    config?: OperatorConfig & { name?: string }
  ): Operator<Input, Output> {
    return new Operator(run, config);
  }

  workflow<F extends FlowBuilder<any, any>>(
    name: string,
    description: string,
    build: (flow: FlowBuilder<any, any>) => F,
    config?: WorkflowConfig
  ): Workflow<InferInitial<F>, InferOutput<F>> {
    const flow = build(new FlowBuilder<unknown, never>());
    return new Workflow(
      {
        config: this._config,
        access: this._access,
      },
      name,
      description,
      flow,
      config
    );
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
}
