// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ContentPreviewContent from './content';

const TOKEN = 'a'.repeat(43);

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../tests/next-intl.stub'
  );
  return {
    useFormatter: () => ({
      dateTime: (value: Date) => value.toISOString().slice(0, 10),
    }),
    useTranslations: translateFromCatalog,
  };
});

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apiEndpoint: 'https://api.genfeed.ai/v1' },
}));

type MockImageProps = ComponentProps<'img'> & {
  fill?: boolean;
  priority?: boolean;
  unoptimized?: boolean;
};

vi.mock('next/image', () => ({
  default: ({
    fill: _fill,
    priority: _priority,
    unoptimized: _unoptimized,
    ...props
  }: MockImageProps) => <img {...props} alt={props.alt ?? ''} />,
}));

function previewDocument() {
  return {
    data: {
      attributes: {
        brand: {
          audience: ['Freelancers'],
          bannerUrl: 'https://cdn.example/banner.png',
          description: 'Invoices that take a minute.',
          name: 'Acme Invoices',
          primaryColor: '#5a2aa0',
          tone: 'Warm, plain-spoken',
        },
        expiresAt: '2026-11-16T10:00:00.000Z',
        items: [
          {
            id: 'item-1',
            media: [],
            platform: 'twitter',
            text: 'Invoices should take a minute.',
          },
        ],
      },
      id: 'preview',
      type: 'public-content-preview',
    },
  };
}

describe('ContentPreviewContent', () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('shows the brand, what was read from its website and the prepared posts', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/view')
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify(previewDocument()), { status: 200 }),
    );

    render(<ContentPreviewContent token={TOKEN} />);

    expect(
      await screen.findByRole('heading', { name: 'Acme Invoices' }),
    ).toBeVisible();
    expect(screen.getByText('Preview · opens until 2026-11-16')).toBeVisible();
    expect(screen.getByText('What we know about you')).toBeVisible();
    expect(screen.getByText('Warm, plain-spoken')).toBeVisible();
    expect(screen.getByText('Freelancers')).toBeVisible();
    expect(screen.getByText('Invoices should take a minute.')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Claim this content' }),
    ).toBeVisible();
  });

  it('counts one view per visit and never counts the read itself', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/view')
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify(previewDocument()), { status: 200 }),
    );

    render(<ContentPreviewContent token={TOKEN} />);
    await screen.findByRole('heading', { name: 'Acme Invoices' });

    await waitFor(() => {
      const viewCalls = fetchMock.mock.calls.filter(([url]) =>
        String(url).endsWith('/view'),
      );
      expect(viewCalls).toHaveLength(1);
      expect(viewCalls[0][1]).toMatchObject({ method: 'POST' });
    });
    const readCall = fetchMock.mock.calls.find(
      ([url]) => !String(url).endsWith('/view'),
    );
    expect(readCall?.[0]).toBe(
      `https://api.genfeed.ai/v1/public/previews/${TOKEN}`,
    );
    expect(readCall?.[1]).toMatchObject({ cache: 'no-store' });
  });

  it('asks for the claim email and tells the visitor to check their inbox', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/view') || url.endsWith('/claim')
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify(previewDocument()), { status: 200 }),
    );

    render(<ContentPreviewContent token={TOKEN} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Claim this content' }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Check your email.',
    );
    expect(
      screen.queryByRole('button', { name: 'Claim this content' }),
    ).toBeNull();
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith('/claim') && init?.method === 'POST',
      ),
    ).toBe(true);
  });

  it('keeps the claim button and says so when the email could not be requested', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/view')
        ? new Response(null, { status: 204 })
        : url.endsWith('/claim')
          ? new Response(null, { status: 429 })
          : new Response(JSON.stringify(previewDocument()), { status: 200 }),
    );

    render(<ContentPreviewContent token={TOKEN} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Claim this content' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not send the link.',
    );
    expect(
      screen.getByRole('button', { name: 'Claim this content' }),
    ).toBeEnabled();
  });

  it('shows one plain message when the link is unknown, expired or revoked', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 404 }));

    render(<ContentPreviewContent token={TOKEN} />);

    expect(
      await screen.findByRole('heading', {
        name: 'This preview is not available',
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Claim this content' }),
    ).toBeNull();
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).endsWith('/view')),
    ).toBe(false);
  });
});
