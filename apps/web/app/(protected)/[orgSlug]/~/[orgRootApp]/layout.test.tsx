import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OrganizationAppIntlLayout from './layout';

vi.mock('@app-i18n/AppPageIntlProvider', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="intl-provider">{children}</div>
  ),
}));

async function renderLayout(orgRootApp: string) {
  render(
    await OrganizationAppIntlLayout({
      children: <div data-testid="page" />,
      params: Promise.resolve({ orgRootApp, orgSlug: 'acme' }),
    }),
  );
}

describe('organization app layout', () => {
  it.each(['messages', 'automation', 'editor'])(
    'delivers the %s messages around the page',
    async (orgRootApp) => {
      await renderLayout(orgRootApp);

      expect(screen.getByTestId('intl-provider')).toContainElement(
        screen.getByTestId('page'),
      );
    },
  );

  it.each(['library', 'publishing', 'unknown'])(
    'leaves %s to its own entry and renders the page bare',
    async (orgRootApp) => {
      await renderLayout(orgRootApp);

      expect(screen.queryByTestId('intl-provider')).not.toBeInTheDocument();
      expect(screen.getByTestId('page')).toBeInTheDocument();
    },
  );
});
