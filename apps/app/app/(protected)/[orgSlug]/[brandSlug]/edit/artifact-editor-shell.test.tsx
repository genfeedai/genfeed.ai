import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ArtifactEditorShell from './artifact-editor-shell';

describe('ArtifactEditorShell', () => {
  it('renders the artifact identity and links back to the originating list', () => {
    render(
      <ArtifactEditorShell
        artifactLabel="Newsletter"
        backHref="/acme/main/publish/newsletters?status=draft"
        backLabel="Back to newsletters"
        description="Draft, revise, approve."
        title="Issue 1"
      >
        <div>Editor body</div>
      </ArtifactEditorShell>,
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Issue 1',
    );
    expect(screen.getByText('Newsletter')).toBeVisible();
    expect(screen.getByText('Draft, revise, approve.')).toBeVisible();
    expect(screen.getByText('Editor body')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Back to newsletters' }),
    ).toHaveAttribute('href', '/acme/main/publish/newsletters?status=draft');
  });

  it('flags unsaved work only while the editor is dirty', () => {
    const { rerender } = render(
      <ArtifactEditorShell
        artifactLabel="Post"
        backHref="/acme/main/publish"
        backLabel="Back to posts"
        title="Launch post"
      >
        <div>Editor body</div>
      </ArtifactEditorShell>,
    );

    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();

    rerender(
      <ArtifactEditorShell
        artifactLabel="Post"
        backHref="/acme/main/publish"
        backLabel="Back to posts"
        isDirty
        title="Launch post"
      >
        <div>Editor body</div>
      </ArtifactEditorShell>,
    );

    expect(screen.getByText('Unsaved changes')).toBeVisible();
  });
});
