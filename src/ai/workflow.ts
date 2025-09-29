import {
  OperatorConfig,
  OperatorDescriptor,
  StepDescriptor,
  WorkflowConfig,
  WorkflowDescriptor,
} from '../common';
import { Config } from '../config';
import { access } from '../middleware/access';
import { context } from '../middleware/context';
import { request } from '../request';
import { OperatorMeta, operatorMeta } from '../runtime';
import { AccessResolver } from '../utils/access-resolver';

export type { OperatorConfig, WorkflowConfig };

export interface OperatorContext<Input> {
  input: Input;
}

export class Operator<Input, Output> {
  private readonly _meta: OperatorMeta;

  constructor(
    public readonly run: (
      context: OperatorContext<Input>
    ) => Output | Promise<Output>,
    public readonly config?: OperatorConfig & { name?: string }
  ) {
    const meta = operatorMeta(run);
    if (!meta) {
      throw new Error(
        `Operator "${config?.name || '<unnamed>'}" is missing metadata. Make sure it is defined using calljmp.ai.operator().`
      );
    }
    this._meta = meta;
  }

  get name(): string | undefined {
    return this.config?.name || this._meta.name;
  }

  get code(): string {
    return this._meta.code;
  }

  with(config: Partial<OperatorConfig>): Operator<Input, Output> {
    return new Operator(this.run, { ...this.config, ...config });
  }
}

export interface WorkflowStep<Input, Output> {
  operator: Operator<Input, Output>;
}

export interface ParallelStep {
  parallel: true;
  branches: Step[][];
}

export interface BranchStep {
  branch: true;
  decider: Step[];
  branches: { [key: string]: Step[] };
}

export type Step = WorkflowStep<any, any> | ParallelStep | BranchStep;

export type InferOutput<B> = B extends FlowBuilder<infer O, any> ? O : never;
export type InferInitial<B> = B extends FlowBuilder<any, infer I> ? I : never;

export class FlowBuilder<CurrentInput = unknown, InitialInput = never> {
  private _steps: Step[] = [];

  next<FirstInput, NextOutput>(
    operator: InitialInput extends never
      ? Operator<FirstInput, NextOutput>
      : never
  ): InitialInput extends never ? FlowBuilder<NextOutput, FirstInput> : never;

  next<NextOutput>(
    operator: Operator<CurrentInput, NextOutput>
  ): FlowBuilder<NextOutput, InitialInput>;

  next(operator: any): any {
    this._steps.push({ operator });
    return this as any;
  }

  parallel<B1 extends FlowBuilder<any, any>>(
    fn1: (branch: FlowBuilder<CurrentInput, InitialInput>) => B1
  ): FlowBuilder<[InferOutput<B1>], InitialInput>;

  parallel<B1 extends FlowBuilder<any, any>, B2 extends FlowBuilder<any, any>>(
    fn1: (branch: FlowBuilder<CurrentInput, InitialInput>) => B1,
    fn2: (branch: FlowBuilder<CurrentInput, InitialInput>) => B2
  ): FlowBuilder<[InferOutput<B1>, InferOutput<B2>], InitialInput>;

  parallel<
    B1 extends FlowBuilder<any, any>,
    B2 extends FlowBuilder<any, any>,
    B3 extends FlowBuilder<any, any>,
  >(
    fn1: (branch: FlowBuilder<CurrentInput, InitialInput>) => B1,
    fn2: (branch: FlowBuilder<CurrentInput, InitialInput>) => B2,
    fn3: (branch: FlowBuilder<CurrentInput, InitialInput>) => B3
  ): FlowBuilder<
    [InferOutput<B1>, InferOutput<B2>, InferOutput<B3>],
    InitialInput
  >;

  parallel<
    B1 extends FlowBuilder<any, any>,
    B2 extends FlowBuilder<any, any>,
    B3 extends FlowBuilder<any, any>,
    B4 extends FlowBuilder<any, any>,
  >(
    fn1: (branch: FlowBuilder<CurrentInput, InitialInput>) => B1,
    fn2: (branch: FlowBuilder<CurrentInput, InitialInput>) => B2,
    fn3: (branch: FlowBuilder<CurrentInput, InitialInput>) => B3,
    fn4: (branch: FlowBuilder<CurrentInput, InitialInput>) => B4
  ): FlowBuilder<
    [InferOutput<B1>, InferOutput<B2>, InferOutput<B3>, InferOutput<B4>],
    InitialInput
  >;

  parallel<
    B1 extends FlowBuilder<any, any>,
    B2 extends FlowBuilder<any, any>,
    B3 extends FlowBuilder<any, any>,
    B4 extends FlowBuilder<any, any>,
    B5 extends FlowBuilder<any, any>,
  >(
    fn1: (branch: FlowBuilder<CurrentInput, InitialInput>) => B1,
    fn2: (branch: FlowBuilder<CurrentInput, InitialInput>) => B2,
    fn3: (branch: FlowBuilder<CurrentInput, InitialInput>) => B3,
    fn4: (branch: FlowBuilder<CurrentInput, InitialInput>) => B4,
    fn5: (branch: FlowBuilder<CurrentInput, InitialInput>) => B5
  ): FlowBuilder<
    [
      InferOutput<B1>,
      InferOutput<B2>,
      InferOutput<B3>,
      InferOutput<B4>,
      InferOutput<B5>,
    ],
    InitialInput
  >;

  parallel<BranchBuilders extends FlowBuilder<any, any>[]>(
    ...branchFns: ((
      branch: FlowBuilder<CurrentInput, InitialInput>
    ) => FlowBuilder<any, InitialInput>)[]
  ): FlowBuilder<
    { [K in keyof BranchBuilders]: InferOutput<BranchBuilders[K]> },
    InitialInput
  > {
    const branches = branchFns.map(
      fn => fn(new FlowBuilder<CurrentInput, InitialInput>())._steps
    );
    this._steps.push({ parallel: true, branches });
    return this as unknown as FlowBuilder<
      { [K in keyof BranchBuilders]: InferOutput<BranchBuilders[K]> },
      InitialInput
    >;
  }

  branch<Branches extends Record<string, FlowBuilder<any, any>>>(
    deciderFn:
      | ((
          flow: FlowBuilder<CurrentInput, InitialInput>
        ) => FlowBuilder<{ branch: keyof Branches }, InitialInput>)
      | Operator<CurrentInput, { branch: keyof Branches }>,
    branchFns: {
      [K in keyof Branches]: (
        branch: FlowBuilder<CurrentInput, InitialInput>
      ) => Branches[K];
    }
  ): FlowBuilder<
    Branches[keyof Branches] extends FlowBuilder<infer BO, any> ? BO : never,
    InitialInput
  > {
    const decider =
      deciderFn instanceof Operator
        ? [{ operator: deciderFn }]
        : deciderFn(new FlowBuilder<CurrentInput, InitialInput>())._steps;

    const branches: { [k: string]: Step[] } = {};
    for (const k of Object.keys(branchFns)) {
      const fn = branchFns[k] as (
        branch: FlowBuilder<CurrentInput, InitialInput>
      ) => FlowBuilder<any, InitialInput>;
      const built = fn(new FlowBuilder<CurrentInput, InitialInput>());
      branches[k] = built._steps;
    }

    this._steps.push({ branch: true, decider, branches });
    return this as unknown as FlowBuilder<
      Branches[keyof Branches] extends FlowBuilder<infer BO, any> ? BO : never,
      InitialInput
    >;
  }
}

export class Workflow<InitialInput, FinalOutput> {
  private _steps: Step[];

  constructor(
    private readonly _ctx: {
      config: Config;
      access: AccessResolver;
    },
    public readonly name: string,
    public readonly description: string,
    flow: FlowBuilder<FinalOutput, InitialInput>,
    public readonly config?: WorkflowConfig
  ) {
    this._steps = flow['_steps'];
  }

  async invoke(initialInput: InitialInput) {
    const buildDescriptor = (step: Step): StepDescriptor => {
      if ('parallel' in step) {
        const branches = step.branches.map(branchSteps =>
          branchSteps.map(s => buildDescriptor(s))
        );

        return { type: 'parallel', branches };
      }

      if ('branch' in step) {
        const branches: { [k: string]: StepDescriptor[] } = {};
        for (const k of Object.keys(step.branches)) {
          branches[k] = step.branches[k].map(s => buildDescriptor(s));
        }

        const decider = step.decider.map(s => buildDescriptor(s));
        return { type: 'branch', decider, branches };
      }

      const descriptor: OperatorDescriptor = {
        type: 'operator',
        name: step.operator.name,
        code: step.operator.code,
        config: step.operator.config,
      };

      return descriptor;
    };

    const descriptor: WorkflowDescriptor = {
      name: this.name,
      description: this.description,
      config: this.config,
      steps: this._steps.map(s => buildDescriptor(s)),
      input: initialInput as unknown,
    };

    return request(`${this._ctx.config.serviceUrl}/ai/workflow`)
      .use(
        context(this._ctx.config),
        access(this._ctx.config, this._ctx.access)
      )
      .post({ descriptor })
      .json<{}>();
  }
}
