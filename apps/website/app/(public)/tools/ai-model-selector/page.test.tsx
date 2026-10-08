import {
  MODEL_SELECTOR_FAQ,
  MODEL_SELECTOR_PATH,
} from '@data/ai-model-selector';
import { getMarketingOgImage } from '@data/marketing-og.data';
import { render, screen } from '@testing-library/react';
import type { ResolvingMetadata } from 'next';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@public/models/models-loader', () => ({
  getPublicModels: vi.fn(async () => []),
}));
vi.mock('@ui/footers', () => ({ SiteFooter: () => null }));
vi.mock('@ui/buttons/tracked/ButtonTracked', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import AiModelSelectorPage, { generateMetadata, revalidate } from './page';

describe('AI model selector SEO', () => {
  it('renders one H1, useful internal links, and the same FAQ in HTML and schema', async () => {
    const { container } = render(await AiModelSelectorPage());
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Free AI model selector for content creation',
    );
    expect(
      screen.getByRole('link', { name: 'Browse all AI models' }),
    ).toHaveAttribute('href', '/models');
    const schema = JSON.parse(
      container.querySelector('script[type="application/ld+json"]')
        ?.textContent ?? '{}',
    );
    expect(
      schema['@graph'].map((item: { '@type': string }) => item['@type']),
    ).toEqual(['WebApplication', 'FAQPage', 'BreadcrumbList']);
    for (const { question, answer } of MODEL_SELECTOR_FAQ) {
      expect(screen.getByText(question)).toBeInTheDocument();
      expect(screen.getByText(answer)).toBeInTheDocument();
      expect(schema['@graph'][1].mainEntity).toContainEqual({
        '@type': 'Question',
        name: question,
        acceptedAnswer: { '@type': 'Answer', text: answer },
      });
    }
    expect(schema['@graph'][0].offers.price).toBe('0');
  });
  it('has a canonical, query-specific social metadata, and bounded route caching', async () => {
    const metadata = await generateMetadata(
      undefined,
      Promise.resolve({ openGraph: { images: [] } }) as ResolvingMetadata,
    );
    expect(metadata.title).toContain('Free AI Model Selector');
    expect(metadata.description).toContain('no signup');
    expect(metadata.alternates?.canonical).toBe(
      `https://genfeed.ai${MODEL_SELECTOR_PATH}`,
    );
    expect(getMarketingOgImage(MODEL_SELECTOR_PATH, 'Selector').url).toContain(
      '/og/ai-model-selector',
    );
    expect(revalidate).toBe(300);
  });
});
