import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const calendarCss = readFileSync(
  resolve(__dirname, '../../../../../styles/calendar.css'),
  'utf8',
);

describe('calendar.css', () => {
  // FullCalendar v7 hashes its class names, so no `.fc` or `.fc-*` ancestor
  // exists in the DOM. A selector scoped under one matches nothing and leaves
  // the runtime-built event chip unstyled (a viewport-sized channel icon).
  it('does not scope any rule under FullCalendar class names', () => {
    const selectors = calendarCss.replace(/\/\*[\s\S]*?\*\//g, '');

    expect(selectors).not.toMatch(/\.fc(?![\w-]*calendar)[\w-]*/);
  });

  it('sizes the channel icon that is cloned into the event chip', () => {
    expect(calendarCss).toMatch(
      /^\.gen-calendar-event-channels svg\s*\{[^}]*width: 0\.75rem/m,
    );
  });
});
