import type { IFieldOption } from '@genfeedai/contracts/interfaces';
import { INGREDIENT_CONFIGS } from '@pages/ingredients/layout/ingredients-layout.config';
import { describe, expect, it } from 'vitest';

describe('INGREDIENT_CONFIGS', () => {
  // The multi-select renders `key={option.value}`, so a repeated value both
  // duplicates the row and collides on the React key.
  it.each(Object.keys(INGREDIENT_CONFIGS))(
    'has no duplicate filter option values for %s',
    (type) => {
      const entries = Object.entries(
        INGREDIENT_CONFIGS[type].filterOptions,
      ) as [string, readonly IFieldOption[] | undefined][];

      for (const [name, options] of entries) {
        if (!options) {
          continue;
        }
        const values = options.map((option) => option.value);
        expect(new Set(values).size, `${type}.${name}`).toBe(values.length);
      }
    },
  );
});
