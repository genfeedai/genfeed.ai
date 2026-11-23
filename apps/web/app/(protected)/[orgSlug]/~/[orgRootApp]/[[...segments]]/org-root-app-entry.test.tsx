/* @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OrgRootAppEntry from './org-root-app-entry';
import '@testing-library/jest-dom/vitest';

vi.mock(
  '@/components/shell/workspace-frame-skeleton/WorkspacePagePending',
  () => ({
    default: () => <p>Loading organization app</p>,
  }),
);

function NeverResolvingSurface(): never {
  throw new Promise(() => undefined);
}

describe('OrgRootAppEntry', () => {
  it('paints the page placeholder without waiting for the surface that reads the URL', () => {
    render(
      <OrgRootAppEntry>
        <NeverResolvingSurface />
      </OrgRootAppEntry>,
    );

    expect(screen.getByText('Loading organization app')).toBeInTheDocument();
  });

  it('renders the surface once it is ready', () => {
    render(
      <OrgRootAppEntry>
        <p>Library surface</p>
      </OrgRootAppEntry>,
    );

    expect(screen.getByText('Library surface')).toBeInTheDocument();
  });
});
