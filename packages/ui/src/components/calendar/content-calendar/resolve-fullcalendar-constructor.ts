type FullCalendarConstructor = new (
  element: HTMLElement,
  options: unknown,
) => { destroy: () => void; render: () => void };

interface FullCalendarModuleShape {
  Calendar?: unknown;
  default?: unknown;
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
