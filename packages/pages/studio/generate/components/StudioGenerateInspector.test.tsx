import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type { IIngredient, IPost } from '@genfeedai/contracts/interfaces';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StudioGenerateInspector from './StudioGenerateInspector';

const mocks = vi.hoisted(() => {
  const findChildren = vi.fn();
  const getPosts = vi.fn();
  const findOne = vi.fn();
  const ingredientsFindOne = vi.fn();
  const ingredientsService = {
    findChildren,
    findOne: ingredientsFindOne,
    getPosts,
  };
  const categoryService = { findOne };
  const resolvers = new Map<unknown, () => Promise<unknown>>();

  return {
    attachContentToNewConversationDraft: vi.fn(),
    categoryService,
    download: vi.fn(async () => undefined),
    findChildren,
    findOne,
    getPosts,
    href: vi.fn((path: string) => `/acme/northstar${path}`),
    ingredientsFindOne,
    ingredientsService,
    push: vi.fn(),
    resolvers,
  };
});

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../apps/app/tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

// `useAuthedService` hands back a `useCallback`-stable resolver. Minting a new
// async function per render invalidates every consumer callback built on it,
// which re-fires their effects on each commit and spins the component forever.
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => {
    const key = factory.toString();
    const existing = mocks.resolvers.get(key);
    if (existing) return existing;
    const resolver = async () => factory('token');
    mocks.resolvers.set(key, resolver);
    return resolver;
  },
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: mocks.href, orgSlug: 'acme' }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('@genfeedai/agent/stores/conversation-composer-draft.store', () => ({
  attachContentToNewConversationDraft:
    mocks.attachContentToNewConversationDraft,
}));

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span aria-label={alt} role="img" />,
}));

vi.mock('@ui/masonry/shared/useMasonryHover', () => ({
  createDownloadHandler: () => mocks.download,
}));

vi.mock('@services/content/ingredients.service', () => ({
  IngredientsService: { getInstance: () => mocks.ingredientsService },
}));

vi.mock('@services/ingredients/images.service', () => ({
  ImagesService: { getInstance: () => mocks.categoryService },
}));

vi.mock('@services/ingredients/videos.service', () => ({
  VideosService: { getInstance: () => mocks.categoryService },
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
    mocks.findOne.mockResolvedValue({ id: 'ing-1' });
    mocks.getPosts.mockResolvedValue([]);
    mocks.findChildren.mockResolvedValue([]);
  });

  it('shows the stored submitted prompt receipt instead of inferring enhancement from the recipe', async () => {
    mocks.findOne.mockResolvedValue({
      id: 'ing-1',
      generationHarness: {
        originalPrompt: 'A founder',
        enhancedPrompt: 'A founder beside a window.',
        status: 'applied',
        source: 'brand',
        brandId: 'brand-1',
        appliedPacks: [],
      },
    });
    render(
      <StudioGenerateInspector
        job={recipeJob}
        onRemix={vi.fn()}
        onUseInPost={vi.fn()}
        onSelect={vi.fn()}
        onVary={vi.fn()}
        runJobs={[recipeJob]}
      />,
    );
    expect(
      await screen.findByText('A founder beside a window.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Prompt enhanced')).toBeInTheDocument();
    // The receipt is read through the image route, never a generic
    // single-ingredient read the API does not serve.
    expect(mocks.findOne).toHaveBeenCalledWith(
      'ing-1',
      undefined,
      expect.any(AbortSignal),
    );
    expect(mocks.ingredientsFindOne).not.toHaveBeenCalled();
  });

  it('shows the Knowledge versions folded into the submitted prompt', async () => {
    mocks.findOne.mockResolvedValue({
      id: 'ing-1',
      generationHarness: {
        originalPrompt: 'Mascot poster',
        enhancedPrompt: 'Mascot poster with a teal heron.',
        status: 'applied',
        source: 'request',
        brandId: 'brand-1',
        appliedPacks: [],
        knowledgeReceipts: [
          {
            excerpt: 'Our mascot Pim is a teal heron.',
            kind: 'TEXT',
            purpose: 'INSPIRATION',
            relevance: 0.58,
            sourceId: 'source-1',
            title: 'Mascot visual guide',
            version: 1,
            versionId: 'version-1',
          },
        ],
      },
    });
    render(
      <StudioGenerateInspector
        job={recipeJob}
        onRemix={vi.fn()}
        onUseInPost={vi.fn()}
        onSelect={vi.fn()}
        onVary={vi.fn()}
        runJobs={[recipeJob]}
      />,
    );

    const receipts = await screen.findByRole('region', {
      name: 'Knowledge sources',
    });
    expect(receipts).toHaveTextContent('Mascot visual guide');
    expect(receipts).toHaveTextContent('Version 1');
  });

  it('puts Recipe, Used in and History in a PanelTabs row under the facts', () => {
    render(
      <StudioGenerateInspector
        job={recipeJob}
        onRemix={vi.fn()}
        onUseInPost={vi.fn()}
        onSelect={vi.fn()}
        onVary={vi.fn()}
        runJobs={[recipeJob]}
      />,
    );

    const tabList = screen.getByRole('tablist', { name: 'Generation details' });
    expect(tabList.parentElement).toHaveClass('h-12', 'border-b');
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Recipe',
      'Used in',
      'History',
    ]);
    // The sidebar header owns the title and close; the panel has neither.
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull();
  });

  it('lists the asset facts it knows and omits credits', () => {
    const ingredient = {
      aspectRatio: '16:9',
      brand: { label: 'Northstar' },
      category: IngredientCategory.VIDEO,
      createdAt: '2026-08-20T10:00:00.000Z',
      id: 'ing-7',
      metadataDuration: 8.4,
      metadataModelLabel: 'Veo 3',
    } as IIngredient;

    render(
      <StudioGenerateInspector
        job={{
          createdAt: 1,
          id: 'ing-7',
          ingredient,
          ingredientId: 'ing-7',
          prompt: 'Drone over the coast',
          status: IngredientStatus.GENERATED,
          type: 'video',
        }}
        onRemix={vi.fn()}
        onUseInPost={vi.fn()}
        onSelect={vi.fn()}
        onVary={vi.fn()}
        runJobs={[]}
      />,
    );

    const facts = screen.getByTestId('studio-generate-inspector');
    expect(facts).toHaveTextContent('TypeVideo');
    expect(facts).toHaveTextContent('ModelVeo 3');
    expect(facts).toHaveTextContent('Aspect16:9');
    expect(facts).toHaveTextContent('Duration8s');
    expect(facts).toHaveTextContent('BrandNorthstar');
    expect(facts).toHaveTextContent('Created');
    expect(facts.textContent ?? '').not.toMatch(/credit/i);
  });

  it('pins download, use in post, remix and Ask Agent for a finished asset', async () => {
    const ingredient = {
      category: IngredientCategory.IMAGE,
      id: 'ing-1',
      thumbnailUrl: 'https://cdn.example/ing-1.png',
    } as IIngredient;
    const job = { ...recipeJob, ingredient };
    const onRemix = vi.fn();
    const onUseInPost = vi.fn();

    render(
      <StudioGenerateInspector
        job={job}
        onRemix={onRemix}
        onUseInPost={onUseInPost}
        onSelect={vi.fn()}
        onVary={vi.fn()}
        runJobs={[job]}
      />,
    );

    expect(screen.getByRole('img', { name: 'Image preview' })).toBeVisible();

    const actions = screen.getByRole('group', { name: 'Asset actions' });
    fireEvent.click(within(actions).getByRole('button', { name: 'Download' }));
    expect(mocks.download).toHaveBeenCalledWith(ingredient);

    fireEvent.click(
      within(actions).getByRole('button', { name: 'Use in post' }),
    );
    expect(onUseInPost).toHaveBeenCalledWith(ingredient);

    fireEvent.click(within(actions).getByRole('button', { name: 'Remix' }));
    expect(onRemix).toHaveBeenCalledWith(job);

    fireEvent.click(
      within(actions).getByRole('button', { name: 'Ask Agent about this' }),
    );
    expect(mocks.attachContentToNewConversationDraft).toHaveBeenCalledWith(
      'acme',
      {
        contentTitle: 'Raw box contents',
        contentType: 'image',
        id: 'ing-1',
        thumbnailUrl: 'https://cdn.example/ing-1.png',
      },
    );
    expect(mocks.push).toHaveBeenCalledWith('/acme/northstar/agent/new');
  });

  it('offers only Vary while the asset has no persisted ingredient', () => {
    render(
      <StudioGenerateInspector
        job={recipeJob}
        onRemix={vi.fn()}
        onUseInPost={vi.fn()}
        onSelect={vi.fn()}
        onVary={vi.fn()}
        runJobs={[recipeJob]}
      />,
    );

    const actions = screen.getByRole('group', { name: 'Asset actions' });
    expect(
      within(actions)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Vary']);
  });

  it('shows the enriched recipe instead of the raw composer text', () => {
    render(
      <StudioGenerateInspector
        job={recipeJob}
        onRemix={vi.fn()}
        onUseInPost={vi.fn()}
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
        onRemix={vi.fn()}
        onUseInPost={vi.fn()}
        onSelect={vi.fn()}
        onVary={vi.fn()}
        runJobs={[recipeJob]}
      />,
    );

    await userEvent.click(screen.getByRole('tab', { name: 'Used in' }));

    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: 'Launch carousel' }),
      ).toHaveAttribute('href', '/acme/northstar/publishing/posts/post-1'),
    );
  });

  it('lists other outputs in the same run as history', async () => {
    const sibling = {
      ...recipeJob,
      id: 'job-2',
      prompt: 'Sibling output',
    };

    render(
      <StudioGenerateInspector
        job={recipeJob}
        onRemix={vi.fn()}
        onUseInPost={vi.fn()}
        onSelect={vi.fn()}
        onVary={vi.fn()}
        runJobs={[recipeJob, sibling]}
      />,
    );

    await userEvent.click(screen.getByRole('tab', { name: 'History' }));

    expect(
      screen.getByRole('button', { name: 'Sibling output' }),
    ).toBeVisible();
  });

  it('varies from the selected recipe', () => {
    const onVary = vi.fn();

    render(
      <StudioGenerateInspector
        job={recipeJob}
        onRemix={vi.fn()}
        onUseInPost={vi.fn()}
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
        onRemix={vi.fn()}
        onUseInPost={vi.fn()}
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
        onRemix={vi.fn()}
        onUseInPost={vi.fn()}
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
        onRemix={vi.fn()}
        onUseInPost={vi.fn()}
        onSelect={vi.fn()}
        onVary={vi.fn()}
        runJobs={[]}
      />,
    );

    // A prompt-only job gets the synthesized fallback recipe, so the panel
    // appends its enrichment summary. Assert the stored prompt is rendered
    // whole rather than pinning the exact text node.
    expect(screen.getByTestId('studio-generate-inspector')).toHaveTextContent(
      prompt,
    );
  });
});
