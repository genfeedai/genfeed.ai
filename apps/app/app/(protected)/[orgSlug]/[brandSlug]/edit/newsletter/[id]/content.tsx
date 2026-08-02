'use client';

import {
  APP_ROUTES,
  ARTIFACT_EDITOR_RETURN_PARAM,
  resolveArtifactEditorBackHref,
} from '@genfeedai/constants';
import { formatNewsletterStatusLabel } from '@helpers/content/newsletters.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { ArtifactEditorPageProps } from '@props/content/artifact-editor.props';
import Badge from '@ui/display/badge/Badge';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import { useSearchParams } from 'next/navigation';
import ArtifactEditorShell from '../../artifact-editor-shell';
import NewsletterContextReview from '../newsletter-context-review';
import NewsletterEditor, {
  NewsletterEditorActions,
} from '../newsletter-editor';
import { useNewsletterEditor } from '../useNewsletterEditor';

export default function NewsletterEditorContent({
  artifactId,
}: ArtifactEditorPageProps) {
  const { href } = useOrgUrl();
  const searchParams = useSearchParams();
  const {
    contextPreview,
    isEditorDirty,
    editorState,
    handleApprove,
    handleArchive,
    handleEditorChange,
    handlePublish,
    handleRegenerate,
    handleSave,
    isLoading,
    loadingAction,
    newsletter,
  } = useNewsletterEditor(artifactId);

  const backHref = resolveArtifactEditorBackHref(
    searchParams.get(ARTIFACT_EDITOR_RETURN_PARAM),
    href(APP_ROUTES.POSTS.NEWSLETTERS),
  );

  if (!newsletter) {
    return (
      <ArtifactEditorShell
        artifactLabel="Newsletter"
        backHref={backHref}
        backLabel="Back to newsletters"
        title={isLoading ? 'Loading newsletter…' : 'Newsletter not found'}
      >
        {isLoading ? (
          <SkeletonCard />
        ) : (
          <div className="rounded-lg border border-dashed border-border p-6 text-muted-foreground text-sm">
            This newsletter is unavailable. It may have been archived or
            removed.
          </div>
        )}
      </ArtifactEditorShell>
    );
  }

  return (
    <ArtifactEditorShell
      actions={
        <NewsletterEditorActions
          isEditorDirty={isEditorDirty}
          loadingAction={loadingAction}
          selectedNewsletter={newsletter}
          onApprove={handleApprove}
          onArchive={handleArchive}
          onPublish={handlePublish}
          onRegenerate={handleRegenerate}
          onSave={handleSave}
        />
      }
      artifactLabel="Newsletter"
      backHref={backHref}
      backLabel="Back to newsletters"
      badges={
        <Badge status={newsletter.status}>
          {formatNewsletterStatusLabel(newsletter.status)}
        </Badge>
      }
      description="Draft, revise, approve, then publish when the issue is ready."
      isDirty={isEditorDirty}
      title={newsletter.label}
    >
      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <NewsletterEditor
          editorState={editorState}
          onEditorChange={handleEditorChange}
        />

        <NewsletterContextReview contextPreview={contextPreview} />
      </div>
    </ArtifactEditorShell>
  );
}
