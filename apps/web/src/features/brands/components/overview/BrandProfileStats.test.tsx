import { CredentialPlatform } from '@genfeedai/contracts';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BrandProfileStats from './BrandProfileStats';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

const account = {
  credentialId: 'credential-1',
  handle: 'studio',
  platform: CredentialPlatform.TWITTER,
};

describe('BrandProfileStats', () => {
  it('shows each metric that has data and leaves out the rest', () => {
    render(
      <BrandProfileStats
        accounts={[]}
        reach={{ engagements: 0, impressions: 52_000, views: 1_200 }}
      />,
    );

    const summary = screen.getByTestId('metric-summary');
    expect(summary).toHaveTextContent(/1\.2K\s*views/);
    expect(summary).toHaveTextContent(/52K\s*impressions/);
    expect(summary).not.toHaveTextContent('engagements');
  });

  it('lists the connected accounts and skips one that dropped off', () => {
    render(
      <BrandProfileStats
        accounts={[
          account,
          { ...account, credentialId: 'credential-2', isConnected: false },
        ]}
        reach={null}
      />,
    );

    expect(
      within(
        screen.getByRole('list', { name: 'Connected accounts' }),
      ).getAllByRole('listitem'),
    ).toHaveLength(1);
    expect(screen.queryByTestId('metric-summary')).toBeNull();
  });

  it('renders nothing until there is something to show', () => {
    const { container } = render(
      <BrandProfileStats
        accounts={[]}
        reach={{ engagements: 0, impressions: null, views: null }}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
