import { useIngredientServices } from '@hooks/data/ingredients/use-ingredient-services/use-ingredient-services';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs', () => ({
  useAuth: vi.fn(() => ({ getToken: vi.fn() })),
}));

describe('useIngredientServices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ingredient services', () => {
    const { result } = renderHook(() => useIngredientServices());
    expect(result.current).toBeDefined();
  });
});
