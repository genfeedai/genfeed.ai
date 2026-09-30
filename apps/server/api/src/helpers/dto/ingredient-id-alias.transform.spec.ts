import { describe, expect, it } from 'vitest';
import { resolveIngredientIdAlias } from './ingredient-id-alias.transform';

describe('resolveIngredientIdAlias', () => {
  it('copies a string ingredient onto ingredientId', () => {
    const instance: { ingredientId?: string } = {};

    resolveIngredientIdAlias({ ingredient: 'ing-1' }, instance);

    expect(instance.ingredientId).toBe('ing-1');
  });

  it('copies a relationship object ingredient.id onto ingredientId', () => {
    const instance: { ingredientId?: string } = {};

    resolveIngredientIdAlias({ ingredient: { id: 'ing-2' } }, instance);

    expect(instance.ingredientId).toBe('ing-2');
  });

  it('does not overwrite an explicit ingredientId', () => {
    const instance = { ingredientId: 'canonical' };

    resolveIngredientIdAlias({ ingredient: 'ing-1' }, instance);

    expect(instance.ingredientId).toBe('canonical');
  });
});
