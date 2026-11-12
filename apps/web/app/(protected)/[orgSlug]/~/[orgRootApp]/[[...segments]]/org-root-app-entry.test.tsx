/* @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import OrgRootAppEntry from './org-root-app-entry';
import '@testing-library/jest-dom/vitest';

vi.mock(
  '@/components/shell/workspace-frame-skeleton/WorkspaceContentSkeleton',
  () => ({
    default: () => <p>Loading organization app</p>,
  }),
);
vi.mock('./org-root-app-surface', () => ({
  default: () => new Promise(() => undefined),
}));

describe('OrgRootAppEntry', () => {
  it('paints the page placeholder without waiting for the surface that reads the URL', () => {
    render(
      <OrgRootAppEntry
        orgRootApp="library"
        params={Promise.resolve({ orgSlug: 'acme' })}
      />,
    );

    expect(screen.getByText('Loading organization app')).toBeInTheDocument();
  });

  it('hands the surface the app next to the organization and the rest of the path', async () => {
    const entry = OrgRootAppEntry({
      orgRootApp: 'publishing',
      params: Promise.resolve({ orgSlug: 'acme', segments: ['overview'] }),
    });
    const surface = (
      entry.props as { children: ReactElement<{ params: Promise<unknown> }> }
    ).children;

    expect(await surface.props.params).toEqual({
      orgRootApp: 'publishing',
      orgSlug: 'acme',
      segments: ['overview'],
    });
  });
});
