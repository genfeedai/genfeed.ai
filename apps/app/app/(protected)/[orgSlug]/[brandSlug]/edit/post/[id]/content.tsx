'use client';

import {
  APP_ROUTES,
  ARTIFACT_EDITOR_RETURN_PARAM,
  resolveArtifactEditorBackHref,
} from '@genfeedai/constants';
import { ButtonVariant, formatPlatformLabel } from '@genfeedai/enums';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { ArtifactEditorPageProps } from '@props/content/artifact-editor.props';
import Badge from '@ui/display/badge/Badge';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import { Button } from '@ui/primitives/button';
import { useSearchParams } from 'next/navigation';
import ArtifactEditorShell from '../../artifact-editor-shell';
import PostEditor, { POST_EDITOR_FORM_ID } from '../post-editor';
import { usePostEditor } from '../usePostEditor';

export default function PostEditorContent({
  artifactId,
}: ArtifactEditorPageProps) {
  const { href } = useOrgUrl();
  const searchParams = useSearchParams();
  const { form, handleSave, isDirty, isLoading, isSaving, post } =
    usePostEditor(artifactId);

  const backHref = resolveArtifactEditorBackHref(
    searchParams.get(ARTIFACT_EDITOR_RETURN_PARAM),
    href(APP_ROUTES.PUBLISH.OVERVIEW),
  );

  if (!post) {
    return (
      <ArtifactEditorShell
        artifactLabel="Post"
        backHref={backHref}
        backLabel="Back to posts"
        title={isLoading ? 'Loading post…' : 'Post not found'}
      >
        {isLoading ? (
          <SkeletonCard />
        ) : (
          <div className="rounded-lg border border-dashed border-border p-6 text-muted-foreground text-sm">
            This post is unavailable. It may have been deleted or published from
            another workspace.
          </div>
        )}
      </ArtifactEditorShell>
    );
  }

  return (
    <ArtifactEditorShell
      actions={
        <Button
          type="submit"
          form={POST_EDITOR_FORM_ID}
          label={isSaving ? 'Saving…' : 'Save'}
          variant={ButtonVariant.DEFAULT}
          isDisabled={isSaving}
        />
      }
      artifactLabel="Post"
      backHref={backHref}
      backLabel="Back to posts"
      badges={
        <>
          <Badge>{formatPlatformLabel(post.platform) ?? post.platform}</Badge>
          <Badge status={post.status}>{post.status}</Badge>
        </>
      }
      description="Update the details for this scheduled post."
      isDirty={isDirty}
      title={post.label || 'Edit Post'}
    >
      <PostEditor form={form} post={post} onSubmit={handleSave} />
    </ArtifactEditorShell>
  );
}
