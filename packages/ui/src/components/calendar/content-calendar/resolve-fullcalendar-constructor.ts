type FullCalendarConstructor = new (
  element: HTMLElement,
  options: unknown,
) => { destroy: () => void; render: () => void };

interface FullCalendarModuleShape {
  Calendar?: unknown;
  default?: unknown;
}

/**
 * Next 16 / Turbopack rewrites `fullcalendar`'s dual named+default export so a
 * dynamic `import()` often yields `{ default: Calendar }` and no named
 * `Calendar`. Native ESM and unit mocks keep the named export.
 */
export function resolveFullCalendarConstructor(
  module: FullCalendarModuleShape,
): FullCalendarConstructor {
  const nestedDefault =
    module.default && typeof module.default === 'object'
      ? (module.default as FullCalendarModuleShape).Calendar
      : undefined;

  const candidate = [module.Calendar, module.default, nestedDefault].find(
    (value): value is FullCalendarConstructor => typeof value === 'function',
  );

  if (!candidate) {
    throw new Error('Unable to load FullCalendar component');
  }

  return candidate;
}
