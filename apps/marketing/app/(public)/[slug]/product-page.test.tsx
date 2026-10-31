import { getProductBySlug } from '@data/products.data';
import ProductPage from '@public/[slug]/product-page';
import { render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@web-components/PageLayout', () => ({
  default: ({
    children,
    title,
    description,
    heroVisual,
  }: {
    children: ReactNode;
    title: string;
    description: string;
    heroVisual: ReactNode;
  }) => (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
      {heroVisual}
      {children}
    </div>
  ),
}));

describe('ProductPage', () => {
  it('renders the hire-agents page with tagline and agent library categories', () => {
    const product = getProductBySlug('hire-agents');
    if (!product) {
      throw new Error('Expected fixture product "hire-agents" to exist');
    }

    render(<ProductPage product={product} />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText('Open Agent Library')).toBeInTheDocument();
    expect(
      screen.getByText(/Operate Genfeed through a unified agent interface\./i),
    ).toBeInTheDocument();

    expect(screen.getByText('Social / Engagement Agents')).toBeInTheDocument();
    expect(screen.getByText('Workflow Agents')).toBeInTheDocument();
    expect(screen.getByText('Content Agents')).toBeInTheDocument();

    expect(screen.getByText('Twitch Chat Agent')).toBeInTheDocument();
    expect(screen.getByText('Workflow Trigger Agent')).toBeInTheDocument();
    expect(screen.getByText('Newsletter Agent')).toBeInTheDocument();
  });

  it.each([
    [
      'docs',
      'Read the guides and API reference, or contribute fixes on GitHub.',
    ],
    [
      'mobile',
      'Join the alpha and approve, review and publish from your phone.',
    ],
    [
      'extension',
      'Join the alpha and use Genfeed from any page in your browser.',
    ],
    ['chatgpt', 'Get started with ChatGPT Integration on Genfeed.'],
  ])('writes the %s final CTA for that product', (slug, body) => {
    const product = getProductBySlug(slug);
    if (!product) {
      throw new Error(`Expected fixture product "${slug}" to exist`);
    }

    render(<ProductPage product={product} />);

    expect(screen.getByText(body)).toBeInTheDocument();
  });
});
