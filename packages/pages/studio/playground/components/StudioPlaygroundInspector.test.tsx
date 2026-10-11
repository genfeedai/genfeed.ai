import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type { IIngredient, IPost } from '@genfeedai/contracts/interfaces';
import { Metadata } from '@genfeedai/models/content/metadata.model';
import { Image } from '@genfeedai/models/ingredients/image.model';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StudioPlaygroundInspector from './StudioPlaygroundInspector';

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
    agentDock: null as null | { attachContent: ReturnType<typeof vi.fn> },
    identity: { orgId: 'org-1', sessionId: 'session-1', userId: 'user-1' },
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

vi.mock('@contexts/ui/agent-dock-context', () => ({
  useAgentDock: () => mocks.agentDock,
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: 'brand-1' }),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => mocks.identity,
}));

vi.mock('@genfeedai/agent/stores/conversation-composer-draft.store', () => ({
  attachContentToNewConversationDraft:
    mocks.attachContentToNewConversationDraft,
}));

vi.mock('next/image', () => ({
  default: ({
    alt,
    src,
    onError,
    onLoad,
  }: {
    alt: string;
    src: string;
    onError?: () => void;
    onLoad?: () => void;
  }) => <img alt={alt} src={src} onError={onError} onLoad={onLoad} />,
}));

vi.mock('@ui/masonry/shared/useMasonryHover', () => ({
  useIngredientDownloadHandler: () => mocks.download,
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

describe('StudioPlaygroundInspector', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.clearAllMocks();
    mocks.identity.sessionId = 'session-1';
    mocks.findOne.mockResolvedValue({ id: 'ing-1', brandId: 'brand-1' });
    mocks.getPosts.mockResolvedValue([]);
    mocks.findChildren.mockResolvedValue([]);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('opens the selected asset in the focused viewer through the shared preview control', async () => {
    const onOpenPreview = vi.fn();
    render(
      <StudioPlaygroundInspector
        job={recipeJob}
        onOpenPreview={onOpenPreview}
        onRemix={vi.fn()}
        onVary={vi.fn()}
        onUseInPost={vi.fn()}
        onSelect={vi.fn()}
        runJobs={[recipeJob]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open preview' }));
    expect(onOpenPreview).toHaveBeenCalledTimes(1);
  });

  it('uses the existing recipe and actions for the large focused preview without nesting another opener', () => {
    const job = {
      ...recipeJob,
      ingredient: {
        id: 'ing-1',
        brandId: 'brand-1',
        category: IngredientCategory.IMAGE,
        cdnUrl: 'https://cdn.example/saved.png',
      } as IIngredient,
    };
    render(
      <StudioPlaygroundInspector
        isFocused
        job={job}
        onOpenPreview={vi.fn()}
        onRemix={vi.fn()}
        onVary={vi.fn()}
        onUseInPost={vi.fn()}
        onSelect={vi.fn()}
        runJobs={[recipeJob]}
      />,
    );
    expect(screen.getAllByTestId('studio-playground-inspector')).toHaveLength(
      1,
    );
    expect(
      screen.queryByRole('button', { name: 'Open preview' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Recipe' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Use in post' })).toBeVisible();
  });

  it('retries a failed saved preview with only a category read, preserving action source and recipe', async () => {
    const ingredient = {
      id: 'ing-1',
      brandId: 'brand-1',
      category: IngredientCategory.IMAGE,
      cdnUrl: 'https://cdn.example/saved.png',
    } as IIngredient;
    const job = { ...recipeJob, ingredient };
    const onRemix = vi.fn();
    const onVary = vi.fn();
    mocks.findOne.mockResolvedValue(ingredient);
    render(
      <StudioPlaygroundInspector
        job={job}
        onRemix={onRemix}
        onUseInPost={vi.fn()}
        onSelect={vi.fn()}
        onVary={onVary}
        runJobs={[job]}
      />,
    );
    await waitFor(() => expect(mocks.findOne).toHaveBeenCalledTimes(1));
    fireEvent.error(screen.getByRole('img', { name: 'Image preview' }));
    expect(
      screen.getByText('This saved asset’s preview could not be loaded.'),
    ).toBeVisible();
    expect(screen.getByText(/A founder at a desk/)).toBeVisible();
    mocks.findOne.mockResolvedValueOnce({
      ...ingredient,
      cdnUrl: 'https://cdn.example/refreshed.png',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry preview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry preview' }));
    await waitFor(() =>
      expect(
        screen.getByRole('img', { name: 'Image preview' }),
      ).toHaveAttribute('src', 'https://cdn.example/refreshed.png'),
    );
    expect(mocks.findOne).toHaveBeenCalledTimes(2);
    expect(onRemix).not.toHaveBeenCalled();
    expect(onVary).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('reports a retried preview to the gallery only once it actually loads', async () => {
    const ingredient = {
      id: 'ing-1',
      brandId: 'brand-1',
      category: IngredientCategory.IMAGE,
      cdnUrl: 'https://cdn.example/saved.png',
    } as IIngredient;
    const job = { ...recipeJob, ingredient };
    const onPreviewRecovered = vi.fn();
    mocks.findOne.mockResolvedValue(ingredient);
    render(
      <StudioPlaygroundInspector
        job={job}
        onPreviewRecovered={onPreviewRecovered}
        onRemix={vi.fn()}
        onUseInPost={vi.fn()}
        onSelect={vi.fn()}
        onVary={vi.fn()}
        runJobs={[job]}
      />,
    );
    await waitFor(() => expect(mocks.findOne).toHaveBeenCalledTimes(1));
    // A first, ordinary load is not a recovery.
    fireEvent.load(screen.getByRole('img', { name: 'Image preview' }));
    fireEvent.error(screen.getByRole('img', { name: 'Image preview' }));
    mocks.findOne.mockResolvedValueOnce({
      ...ingredient,
      cdnUrl: 'https://cdn.example/refreshed.png',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry preview' }));
    await waitFor(() =>
      expect(
        screen.getByRole('img', { name: 'Image preview' }),
      ).toHaveAttribute('src', 'https://cdn.example/refreshed.png'),
    );
    expect(onPreviewRecovered).not.toHaveBeenCalled();

    fireEvent.load(screen.getByRole('img', { name: 'Image preview' }));
    fireEvent.load(screen.getByRole('img', { name: 'Image preview' }));

    expect(onPreviewRecovered).toHaveBeenCalledExactlyOnceWith(
      job,
      'https://cdn.example/refreshed.png',
    );
  });

  it('keeps a retry failure distinct from generation failure and does not resurrect a foreign asset', async () => {
    const ingredient = {
      id: 'ing-1',
      brandId: 'brand-1',
      category: IngredientCategory.IMAGE,
      cdnUrl: 'https://cdn.example/saved.png',
    } as IIngredient;
    const job = { ...recipeJob, ingredient };
    const onPreviewRecovered = vi.fn();
    mocks.findOne.mockResolvedValue(ingredient);
    render(
      <StudioPlaygroundInspector
        job={job}
        onPreviewRecovered={onPreviewRecovered}
        onRemix={vi.fn()}
        onUseInPost={vi.fn()}
        onSelect={vi.fn()}
        onVary={vi.fn()}
        runJobs={[job]}
      />,
    );
    await waitFor(() => expect(mocks.findOne).toHaveBeenCalledTimes(1));
    fireEvent.error(screen.getByRole('img', { name: 'Image preview' }));
    mocks.findOne.mockResolvedValueOnce({
      ...ingredient,
      brandId: 'foreign-brand',
      cdnUrl: 'https://cdn.example/foreign.png',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry preview' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Retry preview' }),
      ).toBeEnabled(),
    );
    expect(screen.queryByRole('img', { name: 'Image preview' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Vary' })).toBeEnabled();
    expect(onPreviewRecovered).not.toHaveBeenCalled();
  });

  it('aborts a preview retry after selection changes and ignores its late image', async () => {
    const ingredient = {
      id: 'ing-1',
      brandId: 'brand-1',
      category: IngredientCategory.IMAGE,
      cdnUrl: 'https://cdn.example/saved.png',
    } as IIngredient;
    const job = { ...recipeJob, ingredient };
    const props = {
      onRemix: vi.fn(),
      onUseInPost: vi.fn(),
      onSelect: vi.fn(),
      onVary: vi.fn(),
      runJobs: [],
    };
    mocks.findOne.mockResolvedValueOnce(ingredient);
    const { rerender } = render(
      <StudioPlaygroundInspector job={job} {...props} />,
    );
    await waitFor(() => expect(mocks.findOne).toHaveBeenCalledTimes(1));
    fireEvent.error(screen.getByRole('img', { name: 'Image preview' }));
    let resolve: (asset: IIngredient) => void = () => {};
    mocks.findOne.mockImplementationOnce(
      () =>
        new Promise<IIngredient>((accept) => {
          resolve = accept;
        }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry preview' }));
    await waitFor(() => expect(mocks.findOne).toHaveBeenCalledTimes(2));
    const oldSignal = mocks.findOne.mock.calls[1][2] as AbortSignal;
    const nextIngredient = {
      ...ingredient,
      id: 'ing-2',
      cdnUrl: 'https://cdn.example/next.png',
    };
    mocks.findOne.mockResolvedValueOnce(nextIngredient);
    rerender(
      <StudioPlaygroundInspector
        job={{
          ...job,
          id: 'job-2',
          ingredientId: 'ing-2',
          ingredient: nextIngredient,
        }}
        {...props}
      />,
    );
    expect(oldSignal.aborted).toBe(true);
    resolve({ ...ingredient, cdnUrl: 'https://cdn.example/late.png' });
    await waitFor(() =>
      expect(
        screen.getByRole('img', { name: 'Image preview' }),
      ).toHaveAttribute('src', nextIngredient.cdnUrl),
    );
  });

  it('recovers a native video loading error without invoking continuation actions', async () => {
    const ingredient = {
      id: 'ing-1',
      brandId: 'brand-1',
      category: IngredientCategory.VIDEO,
      cdnUrl: 'https://cdn.example/saved.mp4',
    } as IIngredient;
    const onRemix = vi.fn();
    const onVary = vi.fn();
    mocks.findOne.mockResolvedValue(ingredient);
    const { container } = render(
      <StudioPlaygroundInspector
        job={{ ...recipeJob, ingredient, type: 'video' }}
        onRemix={onRemix}
        onUseInPost={vi.fn()}
        onSelect={vi.fn()}
        onVary={onVary}
        runJobs={[]}
      />,
    );
    await waitFor(() => expect(mocks.findOne).toHaveBeenCalledTimes(1));
    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    fireEvent.error(video as HTMLVideoElement);
    expect(screen.getByRole('button', { name: 'Retry preview' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry preview' }));
    await waitFor(() =>
      expect(container.querySelector('video')).not.toBeNull(),
    );
    expect(mocks.findOne).toHaveBeenCalledTimes(2);
    expect(onVary).not.toHaveBeenCalled();
    expect(onRemix).not.toHaveBeenCalled();
  });

  it.each([{ brandId: 'foreign-brand' }, { isDeleted: true }])(
    'hides unavailable source previews and their actions (%j)',
    async (invalid) => {
      const ingredient = {
        id: 'ing-1',
        brandId: 'brand-1',
        category: IngredientCategory.IMAGE,
        cdnUrl: 'https://cdn.example/saved.png',
        ...invalid,
      } as IIngredient;
      render(
        <StudioPlaygroundInspector
          job={{ ...recipeJob, ingredient }}
          onRemix={vi.fn()}
          onUseInPost={vi.fn()}
          onSelect={vi.fn()}
          onVary={vi.fn()}
          runJobs={[]}
        />,
      );
      expect(screen.getByRole('status')).toHaveTextContent(
        'This asset is unavailable',
      );
      expect(screen.queryByRole('img')).toBeNull();
      expect(screen.queryByRole('group', { name: 'Asset actions' })).toBeNull();
      await waitFor(() => expect(mocks.findOne).not.toHaveBeenCalled());
    },
  );

  it('shows the stored submitted prompt receipt instead of inferring enhancement from the recipe', async () => {
    mocks.findOne.mockResolvedValue({
      id: 'ing-1',
      brandId: 'brand-1',
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
      <StudioPlaygroundInspector
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
      brandId: 'brand-1',
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
      <StudioPlaygroundInspector
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
      <StudioPlaygroundInspector
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
      brand: { label: 'Northstar' },
      brandId: 'brand-1',
      category: IngredientCategory.VIDEO,
      createdAt: '2026-08-20T10:00:00.000Z',
      id: 'ing-7',
      metadata: {
        duration: 8.4,
        height: 1080,
        modelLabel: 'Veo 3',
        width: 1920,
      },
    } as IIngredient;

    render(
      <StudioPlaygroundInspector
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

    const facts = screen.getByTestId('studio-playground-inspector');
    expect(facts).toHaveTextContent('TypeVideo');
    expect(facts).toHaveTextContent('ModelVeo 3');
    expect(facts).toHaveTextContent('Aspect16:9');
    expect(facts).toHaveTextContent('Duration8s');
    expect(facts).toHaveTextContent('BrandNorthstar');
    expect(facts).toHaveTextContent('Created');
    // Video references do not survive the Auto model, so videos get no Remix.
    expect(screen.queryByRole('button', { name: 'Remix' })).toBeNull();
    expect(facts.textContent ?? '').not.toMatch(/credit/i);
  });

  it('pins download, use in post, remix and Ask Agent for a finished asset', async () => {
    const ingredient = {
      brandId: 'brand-1',
      category: IngredientCategory.IMAGE,
      id: 'ing-1',
      thumbnailUrl: 'https://cdn.example/ing-1.png',
    } as IIngredient;
    const job = { ...recipeJob, ingredient };
    const onRemix = vi.fn();
    const onUseInPost = vi.fn();

    render(
      <StudioPlaygroundInspector
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
        brandId: 'brand-1',
        contentTitle: 'Raw box contents',
        contentType: 'image',
        id: 'ing-1',
        kind: 'ingredient',
        thumbnailUrl: 'https://cdn.example/ing-1.png',
      },
    );
    expect(mocks.push).toHaveBeenCalledWith('/acme/northstar/agent/new');
  });

  it('hands the asset to the agent dock instead of leaving the page', () => {
    const attachContent = vi.fn(() => true);
    mocks.agentDock = { attachContent };
    const ingredient = {
      brandId: 'brand-1',
      category: IngredientCategory.IMAGE,
      id: 'ing-1',
      thumbnailUrl: 'https://cdn.example/ing-1.png',
    } as IIngredient;
    const job = { ...recipeJob, ingredient };

    try {
      render(
        <StudioPlaygroundInspector
          job={job}
          onRemix={vi.fn()}
          onUseInPost={vi.fn()}
          onSelect={vi.fn()}
          onVary={vi.fn()}
          runJobs={[job]}
        />,
      );

      fireEvent.click(
        within(screen.getByRole('group', { name: 'Asset actions' })).getByRole(
          'button',
          { name: 'Ask Agent about this' },
        ),
      );

      expect(attachContent).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'ing-1', kind: 'ingredient' }),
      );
      expect(mocks.attachContentToNewConversationDraft).not.toHaveBeenCalled();
      expect(mocks.push).not.toHaveBeenCalled();
    } finally {
      mocks.agentDock = null;
    }
  });

  it('offers only Vary while the asset has no persisted ingredient', () => {
    render(
      <StudioPlaygroundInspector
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
      <StudioPlaygroundInspector
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
      <StudioPlaygroundInspector
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
      recipe: { ...recipeJob.recipe, originalText: 'Sibling output' },
    };

    render(
      <StudioPlaygroundInspector
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

  it.each([
    IngredientStatus.DRAFT,
    IngredientStatus.PROCESSING,
    IngredientStatus.FAILED,
  ])('hides previews and ready actions for %s even with a URL', (status) => {
    render(
      <StudioPlaygroundInspector
        job={{
          ...recipeJob,
          status,
          url: 'https://cdn.example.com/pending.png',
        }}
        onRemix={vi.fn()}
        onUseInPost={vi.fn()}
        onSelect={vi.fn()}
        onVary={vi.fn()}
        runJobs={[]}
      />,
    );
    expect(
      screen.queryByRole('button', { name: 'Vary' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Download' }),
    ).not.toBeInTheDocument();
  });

  it('varies from the selected recipe', () => {
    const onVary = vi.fn();

    render(
      <StudioPlaygroundInspector
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
      <StudioPlaygroundInspector
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
    const metadata = {
      ...new Metadata({ style: 'cinematic' }),
      mood: 'serene',
    };
    const ingredient = new Image({
      brandId: 'brand-1',
      id: 'ing-9',
      metadata,
      prompt: 'Stored prompt',
    });

    render(
      <StudioPlaygroundInspector
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
      <StudioPlaygroundInspector
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
    expect(screen.getByTestId('studio-playground-inspector')).toHaveTextContent(
      prompt,
    );
  });
});
