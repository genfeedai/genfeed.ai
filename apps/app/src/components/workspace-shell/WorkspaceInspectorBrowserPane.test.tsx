import '@testing-library/jest-dom/vitest';
import { IngredientCategory } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/moonrise${path}` }),
}));

vi.mock('@/features/library-remix/LibrarySourcePreview', () => ({
  default: ({ record }: { record: IIngredient }) => (
    <div data-testid={`source-preview-${record.id}`} />
  ),
  getLibrarySourceLabel: (record: IIngredient) =>
    record.metadataLabel || record.id,
}));

const dispatchOpenFilesTab = vi.fn();

vi.mock('@/lib/workspace/agent-composer-events', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/workspace/agent-composer-events')
  >('@/lib/workspace/agent-composer-events');
  return {
    ...actual,
    dispatchOpenFilesTab: () => dispatchOpenFilesTab(),
  };
});

import WorkspaceInspectorBrowserPane from './WorkspaceInspectorBrowserPane';
import {
  useWorkspaceInspectorPreview,
  WorkspaceInspectorPreviewProvider,
} from './WorkspaceInspectorPreviewContext';

function ingredient(): IIngredient {
  return {
    category: IngredientCategory.IMAGE,
    id: 'image-1',
    ingredientUrl: 'https://cdn.example/image-1.jpg',
    metadataLabel: 'Launch still',
  } as IIngredient;
}

function SelectedPreview() {
  const { setPreview } = useWorkspaceInspectorPreview();

  useEffect(() => {
    setPreview({ record: ingredient() });
  }, [setPreview]);

  return <WorkspaceInspectorBrowserPane />;
}

describe('WorkspaceInspectorBrowserPane', () => {
  it('previews a selected library file', () => {
    render(
      <WorkspaceInspectorPreviewProvider>
        <SelectedPreview />
      </WorkspaceInspectorPreviewProvider>,
    );

    expect(screen.getByTestId('source-preview-image-1')).toBeInTheDocument();
    expect(screen.getByText('Launch still')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open in Library' }),
    ).toHaveAttribute('href', '/acme/moonrise/library');
  });

  it('embeds a published http(s) page when no file is selected', () => {
    render(
      <WorkspaceInspectorPreviewProvider>
        <WorkspaceInspectorBrowserPane pageUrl="https://x.com/genfeed/status/1" />
      </WorkspaceInspectorPreviewProvider>,
    );

    expect(screen.getByTitle('Preview of x.com')).toHaveAttribute(
      'src',
      'https://x.com/genfeed/status/1',
    );
    expect(screen.getByRole('link', { name: 'Open page' })).toHaveAttribute(
      'href',
      'https://x.com/genfeed/status/1',
    );
  });

  it('opens Files from the empty preview state', () => {
    render(
      <WorkspaceInspectorPreviewProvider>
        <WorkspaceInspectorBrowserPane />
      </WorkspaceInspectorPreviewProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Files' }));
    expect(dispatchOpenFilesTab).toHaveBeenCalledTimes(1);
  });
});
