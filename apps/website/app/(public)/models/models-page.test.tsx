import { render, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@hooks/ui/use-marketing-entrance', () => ({
  useMarketingEntrance: () => ({ current: null }),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'https://api.genfeed.test/v1',
    apps: { app: 'https://app.genfeed.test' },
  },
}));

vi.mock('@ui/buttons/tracked/ButtonTracked', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@web-components/PageLayout', () => ({
  default: ({
    children,
    description,
    heroActions,
    heroVisual,
    title,
  }: {
    children: ReactNode;
    description: ReactNode;
    heroActions: ReactNode;
    heroVisual: ReactNode;
    title: ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {heroActions}
      {heroVisual}
      {children}
    </main>
  ),
}));

const { default: ModelsContent } = await import('./models-content');
const { getPublicModels } = await import('./models-loader');
const { default: ModelsPage } = await import('./page');

const MODEL_RESOURCE = {
  attributes: {
    aspectRatios: ['1:1'],
    capabilities: ['text-to-image'],
    category: 'image',
    description: 'A model delivered by the live public registry.',
    durations: [],
    endpoint: 'private/provider-endpoint',
    isDefault: true,
    isHighlighted: false,
    key: 'provider/runtime-model',
    label: 'Runtime Model',
    provider: 'runtime-provider',
    recommendedFor: ['campaigns'],
    supportsFeatures: [],
  },
  id: 'model-runtime',
  type: 'model-catalog',
};

function successfulResponse() {
  return {
    json: () =>
      Promise.resolve({
        data: [MODEL_RESOURCE],
        links: { pagination: { pages: 1, total: 1 } },
      }),
    ok: true,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getPublicModels', () => {
  it('maps the live JSON:API catalog and ignores fields outside the website contract', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(successfulResponse())),
    );

    const models = await getPublicModels();

    expect(fetch).toHaveBeenCalledWith(
      'https://api.genfeed.test/v1/public/models?limit=100&page=1',
      { next: { revalidate: 3600 } },
    );
    expect(models).toEqual([
      expect.objectContaining({
        category: 'image',
        id: 'model-runtime',
        label: 'Runtime Model',
      }),
    ]);
    expect(models?.[0]).not.toHaveProperty('endpoint');
  });

  it('returns null instead of inventing a fallback catalog', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ json: () => Promise.resolve({}), ok: false }),
      ),
    );

    await expect(getPublicModels()).resolves.toBeNull();
  });
});

describe('Models route', () => {
  it('hands the current registry to the page content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(successfulResponse())),
    );

    const element = (await ModelsPage()) as ReactElement<{
      models: Array<{ label: string }> | null;
    }>;

    expect(element.props.models?.[0]?.label).toBe('Runtime Model');
  });

  it('renders a grouped editorial index from dynamic model data', () => {
    render(
      <ModelsContent
        models={[
          {
            aspectRatios: ['1:1'],
            capabilities: ['text-to-image'],
            category: 'image',
            description: 'A model delivered by the live public registry.',
            durations: [],
            id: 'model-runtime',
            isDefault: true,
            isHighlighted: false,
            key: 'provider/runtime-model',
            label: 'Runtime Model',
            provider: 'runtime-provider',
            recommendedFor: [],
            supportsFeatures: [],
          },
        ]}
      />,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Models' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Image' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Runtime Model' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Runtime Provider')).toBeInTheDocument();
  });
});
