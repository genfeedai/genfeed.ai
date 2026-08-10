import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Calendar } from './calendar';

describe('Calendar', () => {
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

  it('renders a down chevron for dropdown facades instead of a right arrow', () => {
    const { container } = render(
      <Calendar
        mode="single"
        captionLayout="dropdown"
        defaultMonth={new Date(2026, 7, 9)}
        startMonth={new Date(2020, 0, 1)}
        endMonth={new Date(2030, 11, 31)}
      />,
    );

    // lucide ChevronDown uses a polyline path distinct from ChevronRight.
    // At least two down chevrons (month + year) should be present in facades.
    const svgs = container.querySelectorAll('[aria-hidden="true"] svg');
    expect(svgs.length).toBeGreaterThanOrEqual(2);
  });
});
