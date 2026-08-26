import type { PluginInput } from 'fullcalendar';

type FullCalendarConstructor = new (
  element: HTMLElement,
  options: unknown,
) => { destroy: () => void; render: () => void };

interface FullCalendarModuleShape {
  Calendar?: unknown;
  default?: unknown;
}

interface FullCalendarPluginModuleShape {
  default?: unknown;
  name?: unknown;
}

function isCalendarConstructor(
  value: unknown,
): value is FullCalendarConstructor {
  return typeof value === 'function';
}

/**
 * Next 16 / Turbopack and Vitest ESM interop both wrap `fullcalendar`'s dual
 * named+default export. Dynamic `import()` can yield any of:
 * `{ Calendar }`, `{ default: Calendar }`, `{ default: { Calendar } }`,
 * or a double-default `{ default: { default: Calendar } }`.
 */
function unwrapCalendarConstructor(
  value: unknown,
  seen: Set<unknown>,
): FullCalendarConstructor | undefined {
  if (!value || seen.has(value)) {
    return undefined;
  }
  seen.add(value);

  if (isCalendarConstructor(value)) {
    return value;
  }

  if (typeof value !== 'object') {
    return undefined;
  }

  const module = value as FullCalendarModuleShape;
  return (
    unwrapCalendarConstructor(module.Calendar, seen) ??
    unwrapCalendarConstructor(module.default, seen)
  );
}

export function resolveFullCalendarConstructor(
  module: FullCalendarModuleShape,
): FullCalendarConstructor {
  const candidate = unwrapCalendarConstructor(module, new Set());

  if (!candidate) {
    throw new Error('Unable to load FullCalendar component');
  }

  return candidate;
}

function isFullCalendarPlugin(value: unknown): value is PluginInput {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as FullCalendarPluginModuleShape).name === 'string'
  );
}

function unwrapFullCalendarPlugin(
  value: unknown,
  seen: Set<unknown>,
): PluginInput | undefined {
  if (!value || seen.has(value)) {
    return undefined;
  }
  seen.add(value);

  if (isFullCalendarPlugin(value)) {
    return value;
  }

  if (typeof value !== 'object') {
    return undefined;
  }

  return unwrapFullCalendarPlugin(
    (value as FullCalendarPluginModuleShape).default,
    seen,
  );
}

/**
 * Turbopack can wrap dynamically imported FullCalendar plugins in an extra
 * `default` layer. Passing that module namespace to Calendar makes plugin
 * registration fail before the grid renders, so resolve the named plugin
 * object first and reject malformed imports deterministically.
 */
export function resolveFullCalendarPlugin(module: unknown): PluginInput {
  const candidate = unwrapFullCalendarPlugin(module, new Set());

  if (!candidate) {
    throw new Error('Unable to load FullCalendar plugin');
  }

  return candidate;
}
