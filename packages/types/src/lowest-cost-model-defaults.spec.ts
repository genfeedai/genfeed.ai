import { describe, expectTypeOf, it } from 'vitest';
import type { LowestCostModelDefaultsInput } from './lowest-cost-model-defaults';

describe('LowestCostModelDefaultsInput', () => {
  it('re-exports the named constants contract', () => {
    expectTypeOf<LowestCostModelDefaultsInput>().toMatchTypeOf<{
      isCloud: boolean;
      nodeEnv?: string;
    }>();
  });
});
