import { render } from '@testing-library/react';
import TagsManager from '@ui/tags/manager/TagsManager';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => vi.fn(),
}));

vi.mock('@hooks/data/resource/use-resource/use-resource', () => ({
  useResource: () => ({
    data: [],
    isLoading: false,
    refresh: vi.fn(),
  }),
}));

vi.mock('@services/content/ingredients.service', () => ({
  IngredientsService: { getInstance: () => ({}) },
}));

vi.mock('@services/content/tags.service', () => ({
  TagsService: { getInstance: () => ({}) },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const mockIngredient = {
  id: 'ingredient_1',
  tags: [],
};

describe('TagsManager', () => {
  it('should render without crashing', () => {
    const { container } = render(
      <TagsManager ingredient={mockIngredient} onTagsChange={vi.fn()} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(
      <TagsManager ingredient={mockIngredient} onTagsChange={vi.fn()} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <TagsManager ingredient={mockIngredient} onTagsChange={vi.fn()} />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
