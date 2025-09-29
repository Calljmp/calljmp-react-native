export type AnyFunction = (...args: any[]) => any;

const GLOBAL_KEY = Symbol.for('calljmp.operator.meta');
const globalAny = globalThis as any;
const metaOperatorMap: WeakMap<AnyFunction, OperatorMeta> = (globalAny[
  GLOBAL_KEY
] ??= new WeakMap<AnyFunction, OperatorMeta>());

export interface OperatorMeta {
  code: string;
  name?: string;
}

export function operatorMeta<T extends AnyFunction>(
  fn: T
): OperatorMeta | undefined {
  return metaOperatorMap.get(fn);
}
