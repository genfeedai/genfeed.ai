// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InviteProfile from './invite-profile';

const TOKEN = 'a'.repeat(43);
const UNLOCK = 'Email me the unlock link';

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

function inviteDocument() {
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
        handle: 'acme-invoices',
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

function answerInvite(claimStatus = 204) {
  return async (url: string) => {
    if (url.endsWith('/view')) return new Response(null, { status: 204 });
    if (url.endsWith('/claim'))
      return new Response(null, { status: claimStatus });
    return new Response(JSON.stringify(inviteDocument()), { status: 200 });
  };
}

describe('InviteProfile', () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('shows the locked profile: brand, handle, what we know and the prepared posts', async () => {
    fetchMock.mockImplementation(answerInvite());

    render(<InviteProfile handle="acme-invoices" token={TOKEN} />);

    expect(
      await screen.findByRole('heading', { name: 'Acme Invoices' }),
    ).toBeVisible();
    expect(screen.getByText('@acme-invoices')).toBeVisible();
    expect(
      screen.getByText('Private · only the invited email can unlock it'),
    ).toBeVisible();
    expect(screen.getByText('What we know about you')).toBeVisible();
    expect(screen.getByText('Warm, plain-spoken')).toBeVisible();
    expect(screen.getByText('Freelancers')).toBeVisible();
    expect(screen.getByText('Invoices should take a minute.')).toBeVisible();
    expect(screen.getByText(/opens until Nov 16, 2026/)).toBeVisible();
    expect(screen.getByRole('button', { name: UNLOCK })).toBeVisible();
  });

  it('answers under the handle in any letter case', async () => {
    fetchMock.mockImplementation(answerInvite());

    render(<InviteProfile handle="Acme-Invoices" token={TOKEN} />);

    expect(
      await screen.findByRole('heading', { name: 'Acme Invoices' }),
    ).toBeVisible();
  });

  it('treats a key opened under another handle as a dead link', async () => {
    fetchMock.mockImplementation(answerInvite());

    render(<InviteProfile handle="someone-else" token={TOKEN} />);

    expect(
      await screen.findByRole('heading', {
        name: 'This invite link is no longer active',
      }),
    ).toBeVisible();
    expect(screen.queryByText('Acme Invoices')).toBeNull();
  });

  it('counts one view per visit and never counts the read itself', async () => {
    fetchMock.mockImplementation(answerInvite());

    render(<InviteProfile handle="acme-invoices" token={TOKEN} />);
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

  it('emails the unlock link and tells the lead to check their inbox', async () => {
    fetchMock.mockImplementation(answerInvite());

    render(<InviteProfile handle="acme-invoices" token={TOKEN} />);
    fireEvent.click(await screen.findByRole('button', { name: UNLOCK }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Check your inbox.',
    );
    expect(screen.queryByRole('button', { name: UNLOCK })).toBeNull();
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith('/claim') && init?.method === 'POST',
      ),
    ).toBe(true);
  });

  it('keeps the unlock button and says so when the email could not be requested', async () => {
    fetchMock.mockImplementation(answerInvite(429));

    render(<InviteProfile handle="acme-invoices" token={TOKEN} />);
    fireEvent.click(await screen.findByRole('button', { name: UNLOCK }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not send the link.',
    );
    expect(screen.getByRole('button', { name: UNLOCK })).toBeEnabled();
  });

  it('shows one plain message, with no brand data, for an unknown, expired or revoked key', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 404 }));

    render(<InviteProfile handle="acme-invoices" token={TOKEN} />);

    expect(
      await screen.findByRole('heading', {
        name: 'This invite link is no longer active',
      }),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: UNLOCK })).toBeNull();
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).endsWith('/view')),
    ).toBe(false);
  });
});
