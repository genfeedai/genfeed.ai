import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Calendar } from './calendar';

describe('Calendar', () => {
  it('uses semantic colors for every calendar interaction state', () => {
    const { container } = render(
      <Calendar
        mode="single"
        defaultMonth={new Date(2026, 7, 9)}
        selected={new Date(2026, 7, 9)}
      />,
    );

    const renderedClasses = Array.from(container.querySelectorAll('*'))
      .map((element) => element.className)
      .filter((className): className is string => typeof className === 'string')
      .join(' ');

    expect(renderedClasses).toContain('border-border');
    expect(renderedClasses).toContain('hover:bg-accent');
    expect(renderedClasses).toContain('text-muted-foreground');
    expect(renderedClasses).toContain('bg-primary');
    expect(renderedClasses).toContain('text-primary-foreground');
    expect(renderedClasses).toContain('focus:ring-ring');
    expect(renderedClasses).not.toMatch(
      /\b(?:bg|border|ring|text)-(?:black|white)(?:\b|\/|\[)/,
    );
  });

  it('hides native dropdown selects so month/year labels are not doubled', () => {
    const { container } = render(
      <Calendar
        mode="single"
        captionLayout="dropdown"
        defaultMonth={new Date(2026, 7, 9)}
        selected={new Date(2026, 7, 9)}
        startMonth={new Date(2020, 0, 1)}
        endMonth={new Date(2030, 11, 31)}
      />,
    );

    const selects = container.querySelectorAll('select');
    expect(selects.length).toBeGreaterThanOrEqual(2);

    for (const select of selects) {
      // Library pattern: real <select> is an invisible overlay over the facade label.
      // Without opacity-0 + absolute, both select text and caption_label show
      // ("August August" / "2026 2026").
      expect(select.className).toMatch(/opacity-0/);
      expect(select.className).toMatch(/absolute/);
      expect(select.className).toMatch(/inset-0/);
    }

    // Facade labels (aria-hidden) should sit next to the invisible select.
    const facadeLabels = container.querySelectorAll('[aria-hidden="true"]');
    const facadeText = Array.from(facadeLabels).map((node) =>
      (node.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
    expect(facadeText.some((text) => text.startsWith('August'))).toBe(true);
    expect(facadeText.some((text) => text.startsWith('2026'))).toBe(true);
  });

  it('stacks month/year navigation above the caption so clicks reach it', () => {
    // react-day-picker renders the caption (month/year dropdowns) after Nav
    // in the DOM; `months` is a flex container, so its flex-item children
    // (nav and each `month`) paint in DOM order when z-index is auto on
    // both -- without an explicit z-index, the caption's own box (not just
    // its invisible <select> overlay) sits on top wherever the two overlap,
    // silently swallowing clicks meant for "next/previous month" (found via
    // E2E: #5381).
    const { container } = render(
      <Calendar
        mode="single"
        captionLayout="dropdown"
        defaultMonth={new Date(2026, 7, 9)}
        startMonth={new Date(2020, 0, 1)}
        endMonth={new Date(2030, 11, 31)}
      />,
    );

    const nav = container.querySelector('[class*="absolute right-1 top-0"]');
    expect(nav).toBeTruthy();
    expect(nav?.className).toMatch(/z-\[3\]/);

    const dropdown = container.querySelector('select');
    expect(dropdown).toBeTruthy();
    expect(dropdown?.className).toMatch(/z-\[2\]/);
  });
});
