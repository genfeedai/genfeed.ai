import { ChartContainer, ChartTooltipContent } from '@ui/charts';
import { describe, expect, it } from 'vitest';

describe('@ui/charts', () => {
  it('exports shared chart primitives', () => {
    expect(ChartContainer).toBeTruthy();
    expect(ChartTooltipContent).toBeTruthy();
  });
});
