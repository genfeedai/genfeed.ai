import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OrganizationLibraryLayout from './layout';

vi.mock('@app-i18n/AppPageIntlProvider', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@app/(protected)/[orgSlug]/[brandSlug]/library/layout-client', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="library-layout">{children}</div>
  ),
}));

describe('organization library layout', () => {
  it('mounts the brand Library layout, asset detail panel included, around the page', () => {
    render(
      <OrganizationLibraryLayout>
        <div data-testid="page" />
      </OrganizationLibraryLayout>,
    );

    expect(screen.getByTestId('library-layout')).toContainElement(
      screen.getByTestId('page'),
    );
  });
});
