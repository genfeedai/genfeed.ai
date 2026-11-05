import type { TraceableFunction } from '@libs/interfaces/tracing.interface';
import { startSpan } from '@sentry/nestjs';

/**
 * Tracing at the function definition, never at the call site.
 *
 * `@Traced()` on a class wraps every `async` prototype method in a span named
 * `Class.method`. On a single method it wraps that method, async or not.
 * `traced(name, fn)` does the same for an exported function. Spans are created
 * with Sentry's `startSpan`, so they join the active request trace, take the
 * request context stamped by `span-request-context`, and end with an error
 * status when the promise rejects. `bun run check:traced-definitions` enforces
 * this for API services and exported async functions.
 */

const TRACED_MARKER = Symbol.for('genfeed.traced');
const SPAN_OP = 'function';
const SPAN_ORIGIN = 'manual.genfeed.traced';

/** Nest lifecycle hooks run once at boot or shutdown, not per request. */
const LIFECYCLE_HOOKS: ReadonlySet<string> = new Set([
  'beforeApplicationShutdown',
  'onApplicationBootstrap',
  'onApplicationShutdown',
  'onModuleDestroy',
  'onModuleInit',
]);

interface ReflectMetadataApi {
  defineMetadata(key: unknown, value: unknown, target: object): void;
  getMetadata(key: unknown, target: object): unknown;
  getMetadataKeys(target: object): unknown[];
}

function hasReflectMetadata(
  reflect: typeof Reflect,
): reflect is typeof Reflect & ReflectMetadataApi {
  const candidate: Partial<ReflectMetadataApi> = reflect;
  return (
    typeof candidate.defineMetadata === 'function' &&
    typeof candidate.getMetadata === 'function' &&
    typeof candidate.getMetadataKeys === 'function'
  );
}

/** Nest reads route, event and queue metadata off the method itself. */
function copyReflectMetadata(from: object, to: object): void {
  if (!hasReflectMetadata(Reflect)) {
    return;
  }

  for (const key of Reflect.getMetadataKeys(from)) {
    Reflect.defineMetadata(key, Reflect.getMetadata(key, from), to);
  }
}

function isFunction(value: unknown): value is TraceableFunction {
  return typeof value === 'function';
}

export function isTraced(fn: unknown): boolean {
  return isFunction(fn) && Object.hasOwn(fn, TRACED_MARKER);
}

/** Native `async` only: swc targets es2022, so `async` survives the build. */
function isAsyncFunction(value: unknown): value is TraceableFunction {
  return isFunction(value) && value.constructor.name === 'AsyncFunction';
}

function wrapInSpan<TFn extends TraceableFunction>(
  original: TFn,
  spanName: string,
  functionName: string,
  namespace?: string,
): TFn {
  const attributes: Record<string, string> = {
    'code.function.name': functionName,
    'sentry.op': SPAN_OP,
    'sentry.origin': SPAN_ORIGIN,
  };

  if (namespace) {
    attributes['code.namespace'] = namespace;
  }

  const wrapped = {
    [original.name || functionName](this: unknown, ...args: never[]): unknown {
      return startSpan({ attributes, name: spanName, op: SPAN_OP }, () =>
        original.apply(this, args),
      );
    },
  }[original.name || functionName];

  copyReflectMetadata(original, wrapped);
  Object.defineProperty(wrapped, TRACED_MARKER, { value: true });

  return Object.assign(wrapped, original);
}

function traceClassMethods(target: { name: string; prototype: object }) {
  const { prototype } = target;

  for (const methodName of Object.getOwnPropertyNames(prototype)) {
    if (methodName === 'constructor' || LIFECYCLE_HOOKS.has(methodName)) {
      continue;
    }

    const descriptor = Object.getOwnPropertyDescriptor(prototype, methodName);
    const method = descriptor?.value;

    if (
      !descriptor ||
      descriptor.get ||
      descriptor.set ||
      !isAsyncFunction(method) ||
      isTraced(method)
    ) {
      continue;
    }

    Object.defineProperty(prototype, methodName, {
      ...descriptor,
      value: wrapInSpan(
        method,
        `${target.name}.${methodName}`,
        methodName,
        target.name,
      ),
    });
  }
}

/**
 * Class decorator: spans every async method. Method decorator: spans that
 * method. Accessors, lifecycle hooks and sync methods of a class are skipped.
 */
export function Traced(): ClassDecorator & MethodDecorator {
  return (
    target: object,
    propertyKey?: string | symbol,
    descriptor?: PropertyDescriptor,
  ): void => {
    if (propertyKey === undefined || descriptor === undefined) {
      if (typeof target === 'function') {
        traceClassMethods(target);
      }
      return;
    }

    const method: unknown = descriptor.value;
    if (!isFunction(method) || isTraced(method)) {
      return;
    }

    const methodName = String(propertyKey);
    const className =
      typeof target === 'function' ? target.name : target.constructor.name;

    descriptor.value = wrapInSpan(
      method,
      `${className}.${methodName}`,
      methodName,
      className,
    );
  };
}

/** Wrap an exported function at its definition. */
export function traced<TFn extends TraceableFunction>(
  name: string,
  fn: TFn,
): TFn {
  return wrapInSpan(fn, name, name);
}
