'use client';

import { formatNewsletterStatusLabel } from '@helpers/content/newsletters.helper';
import type { ArtifactEditorPageProps } from '@props/content/artifact-editor.props';
import Badge from '@ui/display/badge/Badge';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import ArtifactEditorShell from '../../artifact-editor-shell';
import NewsletterContextReview from '../newsletter-context-review';
import NewsletterDeliveryCard from '../newsletter-delivery-card';
import NewsletterEditor, {
  NewsletterEditorActions,
} from '../newsletter-editor';
import { useNewsletterEditor } from '../useNewsletterEditor';

export default function NewsletterEditorContent({
  artifactId,
}: ArtifactEditorPageProps) {
  const {
    contextPreview,
    isEditorDirty,
    editorState,
    handleApprove,
    handleArchive,
    handleDelivered,
    handleEditorChange,
    handlePublish,
    handleRegenerate,
    handleSave,
    handleSaveExternalUrl,
    isLoading,
    isSavingExternalUrl,
    loadingAction,
    newsletter,
  } = useNewsletterEditor(artifactId);

  if (!newsletter) {
    return (
      <ArtifactEditorShell
        artifactLabel="Newsletter"
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

        <div className="space-y-6">
          <NewsletterDeliveryCard
            isDirty={isEditorDirty}
            isSavingExternalUrl={isSavingExternalUrl}
            newsletter={newsletter}
            onDelivered={handleDelivered}
            onSaveExternalUrl={handleSaveExternalUrl}
          />
          <NewsletterContextReview contextPreview={contextPreview} />
        </div>
      </div>
    </ArtifactEditorShell>
  );
}
