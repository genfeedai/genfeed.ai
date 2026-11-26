import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ConnectorsShell from './connectors-shell';

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/~/connectors/providers',
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

function BrokenSection(): never {
  throw new Error('section failed');
}

describe('ConnectorsShell', () => {
  it('renders the section under the Connectors heading', () => {
    render(
      <ConnectorsShell>
        <p>Section body</p>
      </ConnectorsShell>,
    );

    expect(screen.getByText('Connectors')).toBeInTheDocument();
    expect(screen.getByText('Section body')).toBeInTheDocument();
  });

  it('adds no empty sub-bar under the topbar', () => {
    render(
      <ConnectorsShell>
        <p>Section body</p>
      </ConnectorsShell>,
    );

    expect(screen.queryByTestId('section-topbar')).not.toBeInTheDocument();
  });

  it('shows an inline error when a section fails to load', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ConnectorsShell>
        <BrokenSection />
      </ConnectorsShell>,
    );

    expect(screen.getByText('This section could not load')).toBeInTheDocument();
    expect(
      screen.getByText('Your other Connectors sections still work.'),
    ).toBeInTheDocument();
  });
});
