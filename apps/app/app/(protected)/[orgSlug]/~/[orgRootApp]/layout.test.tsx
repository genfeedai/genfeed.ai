import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OrganizationAppIntlLayout from './layout';

vi.mock('@app-i18n/AppPageIntlProvider', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@app/(protected)/[orgSlug]/[brandSlug]/library/layout-client', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="library-layout">{children}</div>
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
  it('mounts the brand Library layout, asset detail panel included, on the organization Library', async () => {
    await renderLayout('library');

    expect(screen.getByTestId('library-layout')).toContainElement(
      screen.getByTestId('page'),
    );
  });

  it.each(['messages', 'publishing'])(
    'leaves the %s app without the Library layout',
    async (orgRootApp) => {
      await renderLayout(orgRootApp);

      expect(screen.queryByTestId('library-layout')).not.toBeInTheDocument();
      expect(screen.getByTestId('page')).toBeInTheDocument();
    },
  );
});
