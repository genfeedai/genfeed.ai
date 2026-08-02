/* @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import ArtifactEditorPage, { generateMetadata } from './page';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';

const mockNotFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});

vi.mock('./artifact-editor', () => ({
  default: ({ artifactId, type }: { artifactId: string; type: string }) => (
    <div>
      Mocked artifact editor: {type}/{artifactId}
    </div>
  ),
}));

vi.mock('next/navigation', () => ({
  notFound: () => mockNotFound(),
}));

describe('ArtifactEditorPage', () => {
  it('renders the editor for every supported artifact type', async () => {
    for (const type of ['article', 'newsletter', 'post']) {
      const element = await ArtifactEditorPage({
        params: Promise.resolve({ id: 'artifact-1', type }),
      });

      const { unmount } = render(element);

      expect(
        screen.getByText(`Mocked artifact editor: ${type}/artifact-1`),
      ).toBeInTheDocument();

      unmount();
    }
  });

  it('calls notFound for an unknown artifact type', async () => {
    await expect(
      ArtifactEditorPage({
        params: Promise.resolve({ id: 'artifact-1', type: 'clip' }),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });

  it('titles the page per artifact type', async () => {
    const metadata = await generateMetadata(
      { params: Promise.resolve({ type: 'newsletter' }) },
      Promise.resolve({}) as never,
    );

    expect(metadata.title).toContain('Edit Newsletter');
  });
});
