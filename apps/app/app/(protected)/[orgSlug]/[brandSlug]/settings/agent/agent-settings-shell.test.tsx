import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AgentSettingsShell from './agent-settings-shell';

const mocks = vi.hoisted(() => ({
  brand: { id: 'brand-1', label: 'Acme', slug: 'acme' } as object | null,
  pathname: '/acme/acme/settings/agent',
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/acme${path}` }),
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
vi.mock('@hooks/pages/use-brand-detail/use-brand-detail', () => ({
  useBrandDetail: () => ({
    brand: mocks.brand,
    brandId: 'brand-1',
    hasBrandId: true,
    isLoading: false,
  }),
}));

describe('AgentSettingsShell', () => {
  beforeEach(() => {
    mocks.brand = { id: 'brand-1', label: 'Acme', slug: 'acme' };
    mocks.pathname = '/acme/acme/settings/agent';
  });

  it('links every section to its own path, not a query param', () => {
    render(
      <AgentSettingsShell>
        <p>Section body</p>
      </AgentSettingsShell>,
    );

    expect(screen.getByRole('link', { name: 'Defaults' })).toHaveAttribute(
      'href',
      '/acme/acme/settings/agent',
    );
    expect(screen.getByRole('link', { name: 'Context' })).toHaveAttribute(
      'href',
      '/acme/acme/settings/agent/context',
    );
    expect(screen.getByRole('link', { name: 'Learning' })).toHaveAttribute(
      'href',
      '/acme/acme/settings/agent/learning',
    );
    expect(
      screen.getByRole('link', { name: 'Generation receipts' }),
    ).toHaveAttribute('href', '/acme/acme/settings/agent/receipts');
    expect(screen.getByRole('link', { name: 'Writing voice' })).toHaveAttribute(
      'href',
      '/acme/acme/settings/brand-kit/voice',
    );
    expect(screen.getByText('Section body')).toBeInTheDocument();
  });

  it('lights only the section the path is on', () => {
    mocks.pathname = '/acme/acme/settings/agent/learning';
    render(
      <AgentSettingsShell>
        <p>Section body</p>
      </AgentSettingsShell>,
    );

    expect(screen.getByRole('link', { name: 'Learning' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Defaults' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('shows the missing-brand notice instead of the section', () => {
    mocks.brand = null;
    render(
      <AgentSettingsShell>
        <p>Section body</p>
      </AgentSettingsShell>,
    );

    expect(screen.queryByText('Section body')).not.toBeInTheDocument();
  });
});
