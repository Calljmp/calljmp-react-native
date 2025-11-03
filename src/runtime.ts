export type AnyFunction = (...args: any[]) => any;

const GLOBAL_KEY = Symbol.for('calljmp.agent.meta');
const globalAny = globalThis as any;

const agentsMeta: WeakMap<AnyFunction, AgentMeta> = (globalAny[GLOBAL_KEY] ??=
  new WeakMap<AnyFunction, AgentMeta>());

export interface AgentMeta {
  code: string;
}

export function agentMeta(fn: AnyFunction) {
  return agentsMeta.get(fn);
}
