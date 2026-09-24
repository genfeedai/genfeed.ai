// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { CredentialPlatform } from '@genfeedai/contracts';
import type { BrandDetailSocialConnection } from '@props/pages/brand-detail.props';
import type { PublishingOverviewHealthRow } from '@props/publisher/publishing-overview.props';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AccountHealthSection from './AccountHealthSection';
import CadenceGapsSection from './CadenceGapsSection';

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/studio${path}` }),
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const row: PublishingOverviewHealthRow = {
  accountLabel: 'Studio account',
  connectedDays: 3,
  credentialId: 'instagram-1',
  holdPublishing: true,
  needsReconnect: true,
  platform: CredentialPlatform.INSTAGRAM,
  publishedPosts: 0,
  recentFailures: 1,
  riskLevel: 'medium',
  score: 40,
  state: 'warming',
};
const connections: BrandDetailSocialConnection[] = [
  {
    credentialId: 'other',
    name: 'Wrong account',
    platform: CredentialPlatform.INSTAGRAM,
  },
  {
    credentialId: row.credentialId,
    name: 'Studio Creator',
    handle: 'studio',
    platform: row.platform,
  },
];

describe('publishing account sections', () => {
  it('matches identity by credential, renders the canonical initials/platform, and keeps every health signal', () => {
    render(
      <AccountHealthSection
        connections={connections}
        onRetry={vi.fn()}
        state={{ status: 'success', data: [row] }}
      />,
    );
    const list = screen.getByRole('list', { name: 'healthTitle' });
    expect(within(list).getByText('Studio Creator')).toBeInTheDocument();
    expect(within(list).getByText('@studio')).toBeInTheDocument();
    expect(within(list).getByText('SC')).toBeInTheDocument();
    expect(within(list).getByText('Instagram')).toHaveClass('sr-only');
    expect(screen.queryByText('Wrong account')).not.toBeInTheDocument();
    for (const label of [
      'healthState.warming',
      'healthRisk.medium',
      'healthReconnect',
      'healthHold',
    ]) {
      expect(within(list).getByText(label)).toHaveClass(
        'rounded-full',
        'normal-case',
      );
    }
    expect(
      screen.getByRole('link', {
        name: /healthReconnectAction.*Studio account.*instagram/,
      }),
    ).toHaveAttribute('href', '/acme/studio/settings/integrations');
  });

  it('falls back to account initials when credential identity is missing', () => {
    render(
      <AccountHealthSection
        onRetry={vi.fn()}
        state={{ status: 'success', data: [{ ...row, needsReconnect: false }] }}
      />,
    );
    expect(screen.getByText('Studio account')).toBeInTheDocument();
    expect(screen.getByText('SA')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows scheduled, reconnect, and hold together in cadence', () => {
    render(
      <CadenceGapsSection
        connections={connections}
        onRetry={vi.fn()}
        state={{
          status: 'success',
          data: [
            { ...row, gapDays: null, hasUpcoming: true, lastPublishedAt: null },
          ],
        }}
      />,
    );
    expect(screen.getByText('Studio Creator')).toBeInTheDocument();
    for (const label of [
      'cadenceScheduled',
      'cadenceReconnect',
      'cadenceHold',
    ]) {
      expect(screen.getByText(label)).toHaveClass(
        'rounded-full',
        'normal-case',
      );
    }
    expect(screen.getByText('cadenceNeverPublished')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /cadenceReconnectAction/ }),
    ).toHaveAttribute('href', '/acme/studio/settings/integrations');
  });

  it('keeps a long account name available through its title', () => {
    const name = 'Studio account with a very long name across multiple teams';
    render(
      <AccountHealthSection
        connections={[{ ...connections[1], name }]}
        onRetry={vi.fn()}
        state={{ status: 'success', data: [row] }}
      />,
    );
    expect(screen.getByText(name)).toHaveAttribute('title', name);
  });
});
