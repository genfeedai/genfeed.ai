import { describe, expect, it } from 'vitest';
import { resolveFullCalendarConstructor } from './resolve-fullcalendar-constructor';

class MockCalendar {
  constructor(
    readonly element: HTMLElement,
    readonly options: unknown,
  ) {}

  destroy() {}
  render() {}
}

describe('resolveFullCalendarConstructor', () => {
  it('uses the named Calendar export', () => {
    expect(resolveFullCalendarConstructor({ Calendar: MockCalendar })).toBe(
      MockCalendar,
    );
  });

  it('uses the production default-only interop shape', () => {
    expect(resolveFullCalendarConstructor({ default: MockCalendar })).toBe(
      MockCalendar,
    );
  });

  it('unwraps a nested default.Calendar object', () => {
    expect(
      resolveFullCalendarConstructor({ default: { Calendar: MockCalendar } }),
    ).toBe(MockCalendar);
  });

  it('unwraps a double-default interop constructor', () => {
    expect(
      resolveFullCalendarConstructor({ default: { default: MockCalendar } }),
    ).toBe(MockCalendar);
  });

  it('unwraps a double-default nested Calendar object', () => {
    expect(
      resolveFullCalendarConstructor({
        default: { default: { Calendar: MockCalendar } },
      }),
    ).toBe(MockCalendar);
  });

  it('throws when no constructor is present', () => {
    expect(() => resolveFullCalendarConstructor({})).toThrow(
      'Unable to load FullCalendar component',
    );
  });
});
