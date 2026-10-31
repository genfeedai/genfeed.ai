import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ArtifactEditorShell from './artifact-editor-shell';

describe('ArtifactEditorShell', () => {
  it('renders a compact identity header without a back link by default', () => {
    render(
      <ArtifactEditorShell
        artifactLabel="Post"
        description="Edit the content and scheduling details for this post."
        title="Batch: image content"
      >
        <div>Editor body</div>
      </ArtifactEditorShell>,
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Batch: image content',
    );
    expect(screen.getByText('Post')).toBeVisible();
    expect(
      screen.getByText(
        'Edit the content and scheduling details for this post.',
      ),
    ).toBeVisible();
    expect(screen.getByText('Editor body')).toBeVisible();
    expect(
      screen.queryByRole('link', { name: /back/i }),
    ).not.toBeInTheDocument();
  });

  it('flags unsaved work only while the editor is dirty', () => {
    const { rerender } = render(
      <ArtifactEditorShell artifactLabel="Post" title="Launch post">
        <div>Editor body</div>
      </ArtifactEditorShell>,
    );

    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();

    rerender(
      <ArtifactEditorShell artifactLabel="Post" isDirty title="Launch post">
        <div>Editor body</div>
      </ArtifactEditorShell>,
    );

    expect(screen.getByText('Unsaved changes')).toBeVisible();
  });
});
