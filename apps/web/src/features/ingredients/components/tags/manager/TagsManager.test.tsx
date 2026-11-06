import {
  createIngredientFixture,
  createTagFixture,
} from '@genfeedai/helpers/testing/entity-fixtures';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TagsManager from '@/features/ingredients/components/tags/manager/TagsManager';

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({
    data: [],
    error: null,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  })),
}));

vi.mock('@genfeedai/services/content/ingredients.service', () => ({
  IngredientsService: { getInstance: () => ({}) },
}));

vi.mock('@genfeedai/services/content/tags.service', () => ({
  TagsService: { getInstance: () => ({}) },
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

describe('TagsManager', () => {
  it("shows the ingredient's tags with an Add Tag action", () => {
    render(
      <TagsManager
        ingredient={createIngredientFixture({
          id: 'ingredient_1',
          tags: [createTagFixture({ id: 'tag-1', label: 'Launch' })],
        })}
        ingredientCategory="image"
        onTagsChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Launch')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add Tag/ })).toBeInTheDocument();
  });
});
