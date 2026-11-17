/**
 * Puts the jsdom window back the way the worker found it, once per spec file.
 *
 * `isolate: false` (vitest.config.mts) lets spec files share one worker, and
 * with it one jsdom window. A file that redefines `window.matchMedia`,
 * `navigator.clipboard`, a prototype method such as
 * `Element.prototype.scrollIntoView`, or a static such as
 * `URL.createObjectURL`, or that leaves a listener, a cookie, a class on
 * <html> or a different URL behind, would break whichever file runs next.
 * Import this module first in the setup file: the first import in a worker
 * records every global object and prototype, every later one puts back what a
 * file changed.
 *
 * Timers are not touched. jsdom starts its `requestAnimationFrame` interval
 * through the global `setInterval` and keeps a flag that it is running, so
 * clearing a timer a file left behind can stop animation frames for every file
 * after it. A spec that leaves a timer running clears it itself.
 */

type DescriptorMap = Map<PropertyKey, PropertyDescriptor>;

interface WorkerBaseline {
  documentElementAttributes: Array<[string, string]>;
  /**
   * Vitest's jsdom environment defines each window key as an accessor whose
   * setter stores an assignment (`window.matchMedia = vi.fn()`) in a map it
   * owns, so the property descriptor never changes. These are the values the
   * getters returned at the start, put back through the setter.
   */
  globalAccessorValues: Map<string, unknown>;
  href: string;
  listeners: Array<{
    listener: EventListenerOrEventListenerObject;
    options: boolean | AddEventListenerOptions | undefined;
    target: EventTarget;
    type: string;
  }>;
  targets: Map<object, DescriptorMap>;
}

const BASELINE_KEY = '__webTestWorkerBaseline';

// Keys the test runner itself owns; they change per file on purpose.
const RUNNER_KEY_PATTERN =
  /^(__vitest|__VITEST|__vite|\$\$jest|vitest$|vi$|expect$|chai$|assert$|describe$|it$|test$|suite$|bench$|beforeAll$|afterAll$|beforeEach$|afterEach$|onTestFailed$|onTestFinished$)/u;

// Objects whose own keys the runner or Node rewrites while a file runs.
const SKIPPED_GLOBAL_KEYS = new Set(['global', 'process']);

// The runner sets these on `Error` for every file; they are not file state.
const RUNNER_ERROR_KEYS = new Set(['prepareStackTrace', 'stackTraceLimit']);

function readDescriptors(target: object): DescriptorMap {
  const descriptors: DescriptorMap = new Map();
  for (const key of Reflect.ownKeys(target)) {
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    if (descriptor) {
      descriptors.set(key, descriptor);
    }
  }
  return descriptors;
}

function isSameDescriptor(
  a: PropertyDescriptor,
  b: PropertyDescriptor | undefined,
): boolean {
  return (
    b !== undefined &&
    Object.is(a.value, b.value) &&
    a.get === b.get &&
    a.set === b.set &&
    a.configurable === b.configurable &&
    a.enumerable === b.enumerable &&
    a.writable === b.writable
  );
}

function isRunnerKey(target: object, key: PropertyKey): boolean {
  if (typeof key !== 'string') {
    return false;
  }
  if (target === Error) {
    return RUNNER_ERROR_KEYS.has(key);
  }
  return RUNNER_KEY_PATTERN.test(key);
}

/** Every object a file can patch: each global, and a global class's prototype. */
function collectTargets(): Set<object> {
  const targets = new Set<object>([globalThis, navigator]);
  for (const key of Reflect.ownKeys(globalThis)) {
    if (
      typeof key !== 'string' ||
      key === BASELINE_KEY ||
      SKIPPED_GLOBAL_KEYS.has(key) ||
      RUNNER_KEY_PATTERN.test(key)
    ) {
      continue;
    }
    let value: unknown;
    try {
      value = (globalThis as Record<string, unknown>)[key];
    } catch {
      continue;
    }
    if (
      value === null ||
      (typeof value !== 'object' && typeof value !== 'function')
    ) {
      continue;
    }
    targets.add(value);
    if (typeof value === 'function') {
      const prototype = (value as { prototype?: unknown }).prototype;
      if (prototype && typeof prototype === 'object') {
        targets.add(prototype);
      }
    }
  }
  return targets;
}

function restoreTarget(target: object, baseline: DescriptorMap): void {
  for (const key of Reflect.ownKeys(target)) {
    // Packages in `node_modules` are loaded once per worker and are not
    // evaluated again after `vi.resetModules()`. A global one of them sets up
    // on first load (`AsyncLocalStorage`, `__SENTRY__`, the tslib helpers) must
    // stay, or the files after the first would find it missing.
    if (
      target === globalThis ||
      baseline.has(key) ||
      isRunnerKey(target, key)
    ) {
      continue;
    }
    try {
      delete (target as Record<PropertyKey, unknown>)[key];
    } catch {
      // A non-configurable key a file added cannot be removed.
    }
  }
  for (const [key, descriptor] of baseline) {
    if (isRunnerKey(target, key)) {
      continue;
    }
    if (
      isSameDescriptor(descriptor, Object.getOwnPropertyDescriptor(target, key))
    ) {
      continue;
    }
    try {
      Object.defineProperty(target, key, descriptor);
    } catch {
      // A non-configurable key keeps whatever a file set.
    }
  }
}

function clearCookies(): void {
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0]?.trim();
    if (name) {
      // biome-ignore lint/suspicious/noDocumentCookie: jsdom has no Cookie Store API; a cookie is expired by writing it.
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
  }
}

const workerScope = globalThis as typeof globalThis & {
  [BASELINE_KEY]?: WorkerBaseline;
};

function recordBaseline(): WorkerBaseline {
  const listeners: WorkerBaseline['listeners'] = [];
  for (const target of [window, document] as EventTarget[]) {
    const add = target.addEventListener.bind(target);
    Object.defineProperty(target, 'addEventListener', {
      configurable: true,
      value: (
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
      ) => {
        listeners.push({ listener, options, target, type });
        add(type, listener, options);
      },
      writable: true,
    });
  }

  const targets = new Map<object, DescriptorMap>();
  for (const target of collectTargets()) {
    targets.set(target, readDescriptors(target));
  }

  const globalAccessorValues = new Map<string, unknown>();
  for (const [key, descriptor] of targets.get(globalThis) ?? []) {
    if (typeof key === 'string' && descriptor.get && descriptor.set) {
      try {
        globalAccessorValues.set(key, descriptor.get.call(globalThis));
      } catch {
        // A getter that throws holds no assignment to put back.
      }
    }
  }

  return {
    documentElementAttributes: Array.from(
      document.documentElement.attributes,
      (attribute): [string, string] => [attribute.name, attribute.value],
    ),
    globalAccessorValues,
    href: window.location.href,
    listeners,
    targets,
  };
}

function restoreGlobalAccessorValues(baseline: WorkerBaseline): void {
  for (const [key, value] of baseline.globalAccessorValues) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    if (!descriptor?.get || !descriptor.set) {
      continue;
    }
    try {
      if (!Object.is(descriptor.get.call(globalThis), value)) {
        descriptor.set.call(globalThis, value);
      }
    } catch {
      // A setter that throws keeps whatever a file assigned.
    }
  }
}

function restoreDocument(baseline: WorkerBaseline): void {
  for (const name of document.documentElement.getAttributeNames()) {
    document.documentElement.removeAttribute(name);
  }
  for (const [name, value] of baseline.documentElementAttributes) {
    document.documentElement.setAttribute(name, value);
  }
  for (const name of document.body.getAttributeNames()) {
    document.body.removeAttribute(name);
  }
  document.body.replaceChildren();
  document.head.replaceChildren();
  clearCookies();
  if (window.location.href !== baseline.href) {
    window.history.replaceState(null, '', baseline.href);
  }
}

if (typeof window !== 'undefined') {
  const baseline = workerScope[BASELINE_KEY];
  if (baseline) {
    for (const { listener, options, target, type } of baseline.listeners) {
      target.removeEventListener(type, listener, options);
    }
    baseline.listeners.length = 0;

    for (const [target, descriptors] of baseline.targets) {
      restoreTarget(target, descriptors);
    }
    restoreGlobalAccessorValues(baseline);
    restoreDocument(baseline);
  } else {
    workerScope[BASELINE_KEY] = recordBaseline();
  }
}
