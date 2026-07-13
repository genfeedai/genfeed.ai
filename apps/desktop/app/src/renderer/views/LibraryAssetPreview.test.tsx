import type { IDesktopAsset } from '@genfeedai/desktop-contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LibraryAssetPreview } from './LibraryAssetPreview';

const asset: IDesktopAsset = {
  createdAt: '2026-07-13T00:00:00.000Z',
  displayName: 'Example asset',
  id: 'asset-1',
  kind: 'image',
  mimeType: 'image/png',
  organizationId: 'local-org',
  origin: 'local-import',
  originalFileName: 'example.png',
  residency: 'local-only',
  sha256: 'abc123',
  sizeBytes: 3,
  updatedAt: '2026-07-13T00:00:00.000Z',
  uploadPolicy: 'never',
  workspaceId: 'workspace-1',
};

describe('LibraryAssetPreview', () => {
  it('renders local images through the safe asset protocol', () => {
    render(<LibraryAssetPreview asset={asset} />);

    expect(screen.getByRole('img', { name: 'Example asset' })).toHaveAttribute(
      'src',
      'genfeed-asset://local/asset-1',
    );
  });

  it('renders a clear missing-local state', () => {
    render(
      <LibraryAssetPreview asset={{ ...asset, residency: 'missing-local' }} />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Local file missing');
  });

  it('switches to the missing-local state when a registered file is gone', () => {
    render(<LibraryAssetPreview asset={asset} />);

    fireEvent.error(screen.getByRole('img', { name: 'Example asset' }));

    expect(screen.getByRole('status')).toHaveTextContent('Local file missing');
  });
});
