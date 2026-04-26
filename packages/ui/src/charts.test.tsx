import { ChartContainer, ChartTooltipContent } from '@ui/charts';
import { describe, expect, it } from 'vitest';

describe('@ui/charts', () => {
  it('re-exports shared ship chart primitives', () => {
    expect(ChartContainer).toBeTruthy();
    expect(ChartTooltipContent).toBeTruthy();
  });
});
