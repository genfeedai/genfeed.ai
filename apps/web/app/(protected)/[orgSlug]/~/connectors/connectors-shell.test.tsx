import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConnectorsPrimaryAction } from './connectors-primary-action';
import ConnectorsShell from './connectors-shell';

const mocks = vi.hoisted(() => ({
  activeBrandSlug: 'moonrise',
  brandSlug: '',
  push: vi.fn(),
  segment: 'channels' as string | null,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  useSelectedLayoutSegment: () => mocks.segment,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    activeHref: (path: string) => `/acme/${mocks.activeBrandSlug}${path}`,
    href: (path: string) =>
      mocks.brandSlug ? `/acme/${mocks.brandSlug}${path}` : `/acme/~${path}`,
  }),
}));

const stableAction = vi.fn();

function SectionWithAction() {
  useConnectorsPrimaryAction('Connect account', stableAction);
  return <p>Section body</p>;
}

function BrokenSection(): never {
  throw new Error('section failed');
}

describe('ConnectorsShell', () => {
  beforeEach(() => {
    mocks.brandSlug = '';
    mocks.push.mockClear();
    mocks.segment = 'channels';
  });

  it('shows the active section in the view switch and the primary action in the header', () => {
    render(
      <ConnectorsShell>
        <SectionWithAction />
      </ConnectorsShell>,
    );

    expect(screen.getByText('Section body')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Channels/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Connect account' }),
    ).toBeInTheDocument();
  });

  it('opens another section on its organization route', async () => {
    const user = userEvent.setup();
    render(
      <ConnectorsShell>
        <p>Section body</p>
      </ConnectorsShell>,
    );

    await user.click(screen.getByRole('button', { name: /Channels/ }));
    await user.click(await screen.findByText('Webhooks'));

    expect(mocks.push).toHaveBeenCalledWith('/acme/~/connectors/webhooks');
  });

  it('opens Channels on the selected brand, which has no organization route', async () => {
    const user = userEvent.setup();
    mocks.segment = 'agents';
    render(
      <ConnectorsShell>
        <p>Section body</p>
      </ConnectorsShell>,
    );

    await user.click(screen.getByRole('button', { name: /Agents/ }));
    await user.click(await screen.findByText('Channels'));

    expect(mocks.push).toHaveBeenCalledWith(
      '/acme/moonrise/connectors/channels',
    );
  });

  it('opens another section on the brand route when the page is open on one', async () => {
    const user = userEvent.setup();
    mocks.brandSlug = 'moonrise';
    render(
      <ConnectorsShell>
        <p>Section body</p>
      </ConnectorsShell>,
    );

    await user.click(screen.getByRole('button', { name: /Channels/ }));
    await user.click(await screen.findByText('Webhooks'));

    expect(mocks.push).toHaveBeenCalledWith(
      '/acme/moonrise/connectors/webhooks',
    );
  });

  it('keeps the switch usable when a section fails to load', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.segment = 'providers';
    render(
      <ConnectorsShell>
        <BrokenSection />
      </ConnectorsShell>,
    );

    expect(screen.getByText('This section could not load')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /AI providers/ }),
    ).toBeInTheDocument();
  });
});
