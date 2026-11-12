/* @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OrgLibraryPage from './page';
import '@testing-library/jest-dom/vitest';

vi.mock(
  '@/components/shell/workspace-frame-skeleton/WorkspaceContentSkeleton',
  () => ({
    default: () => <p>Loading organization app</p>,
  }),
);
vi.mock('../../[orgRootApp]/[[...segments]]/org-root-app-surface', () => ({
  default: () => new Promise(() => undefined),
}));

describe('OrgLibraryPage', () => {
  it('paints the page placeholder without waiting for the surface that reads the URL', () => {
    render(<OrgLibraryPage params={Promise.resolve({ orgSlug: 'acme' })} />);

    expect(screen.getByText('Loading organization app')).toBeInTheDocument();
  });

  it('opens the library app', () => {
    const page = OrgLibraryPage({
      params: Promise.resolve({ orgSlug: 'acme' }),
    });

    expect(page.props.orgRootApp).toBe('library');
  });
});
