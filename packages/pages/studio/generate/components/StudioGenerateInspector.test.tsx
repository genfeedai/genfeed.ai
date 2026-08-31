import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import type { IIngredient, IPost } from '@genfeedai/interfaces';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StudioGenerateInspector from './StudioGenerateInspector';

const mocks = vi.hoisted(() => ({
  findChildren: vi.fn(),
  getPosts: vi.fn(),
  href: vi.fn((path: string) => `/acme/northstar${path}`),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../apps/app/tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    findChildren: mocks.findChildren,
    getPosts: mocks.getPosts,
  }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: mocks.href }),
}));

vi.mock('@services/content/ingredients.service', () => ({
  IngredientsService: { getInstance: vi.fn() },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

const recipeJob = {
  createdAt: 1,
  id: 'job-1',
  ingredientId: 'ing-1',
  modelKey: 'flux-dev',
  prompt: 'Raw box contents',
  recipe: {
    blacklist: [],
    brandingMode: 'brand' as const,
    isAudioEnabled: false,
    mood: 'confident',
    outputs: 4,
    promptTemplate: 'product-photo',
    references: [],
    style: 'editorial',
    tags: [],
    text: 'A founder at a desk',
    type: 'image' as const,
  },
  runId: 'run-1',
  status: IngredientStatus.GENERATED,
  type: 'image' as const,
};

describe('StudioGenerateInspector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPosts.mockResolvedValue([]);
    mocks.findChildren.mockResolvedValue([]);
  });

  it('shows the enriched recipe instead of the raw composer text', () => {
    render(
      <StudioGenerateInspector
        job={recipeJob}
        onClose={vi.fn()}
        onSelect={vi.fn()}
        onVary={vi.fn()}
        runJobs={[recipeJob]}
      />,
    );

    expect(screen.getByText(/A founder at a desk/)).toBeVisible();
    expect(screen.getByText(/Brand enrichment: on/)).toBeVisible();
    expect(screen.getByText(/Template: product-photo/)).toBeVisible();
    expect(screen.getByText(/Mood: confident/)).toBeVisible();
    expect(screen.queryByText('Raw box contents')).toBeNull();
  });

  it('lists posts that use the selected asset', async () => {
    mocks.getPosts.mockResolvedValueOnce([
      { id: 'post-1', label: 'Launch carousel' } as IPost,
    ]);

    render(
      <StudioGenerateInspector
        job={recipeJob}
        onClose={vi.fn()}
        onSelect={vi.fn()}
        onVary={vi.fn()}
        runJobs={[recipeJob]}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Used in' }));

    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: 'Launch carousel' }),
      ).toHaveAttribute('href', '/acme/northstar/publishing/posts/post-1'),
    );
  });

  it('lists other outputs in the same run as history', () => {
    const sibling = {
      ...recipeJob,
      id: 'job-2',
      prompt: 'Sibling output',
    };

    render(
      <StudioGenerateInspector
        job={recipeJob}
        onClose={vi.fn()}
        onSelect={vi.fn()}
        onVary={vi.fn()}
        runJobs={[recipeJob, sibling]}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'History' }));

    expect(
      screen.getByRole('button', { name: 'Sibling output' }),
    ).toBeVisible();
  });

  it('varies from the selected recipe', () => {
    const onVary = vi.fn();

    render(
      <StudioGenerateInspector
        job={recipeJob}
        onClose={vi.fn()}
        onSelect={vi.fn()}
        onVary={onVary}
        runJobs={[recipeJob]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Vary' }));
    expect(onVary).toHaveBeenCalledWith(recipeJob);
  });

  it('does not fetch relations for a synthetic failed card', () => {
    render(
      <StudioGenerateInspector
        job={{
          ...recipeJob,
          ingredientId: undefined,
          status: IngredientStatus.FAILED,
        }}
        onClose={vi.fn()}
        onSelect={vi.fn()}
        onVary={vi.fn()}
        runJobs={[recipeJob]}
      />,
    );

    expect(mocks.getPosts).not.toHaveBeenCalled();
    expect(mocks.findChildren).not.toHaveBeenCalled();
  });

  it('still offers recipe when the gallery row only has ingredient metadata', () => {
    const ingredient = {
      category: IngredientCategory.IMAGE,
      id: 'ing-9',
      metadata: { mood: 'serene', style: 'cinematic' },
      promptText: 'Stored prompt',
    } as IIngredient;

    render(
      <StudioGenerateInspector
        job={{
          createdAt: 1,
          id: 'ing-9',
          ingredient,
          ingredientId: 'ing-9',
          prompt: 'Stored prompt',
          status: IngredientStatus.GENERATED,
          type: 'image',
        }}
        onClose={vi.fn()}
        onSelect={vi.fn()}
        onVary={vi.fn()}
        runJobs={[]}
      />,
    );

    expect(screen.getByText(/Stored prompt/)).toBeVisible();
    expect(screen.getByText(/Style: cinematic/)).toBeVisible();
    expect(screen.getByText(/Mood: serene/)).toBeVisible();
  });

  it('shows the complete stored prompt when no structured recipe exists', () => {
    const prompt =
      'A long, detailed generation prompt with lighting, composition, texture, subject placement, and background instructions.';

    render(
      <StudioGenerateInspector
        job={{
          createdAt: 1,
          id: 'job-without-recipe',
          prompt,
          status: IngredientStatus.GENERATED,
          type: 'image',
        }}
        onClose={vi.fn()}
        onSelect={vi.fn()}
        onVary={vi.fn()}
        runJobs={[]}
      />,
    );

    expect(screen.getByText(prompt)).toBeVisible();
  });
});
