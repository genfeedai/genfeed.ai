import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { ArticleDetailHeaderProps } from '@props/edit/article-detail-header.props';
import { Button } from '@ui/primitives/button';
import {
  Archive,
  Check,
  CircleAlert,
  Clipboard,
  Rocket,
  Trash2,
} from 'lucide-react';

export default function ArticleDetailHeader({
  state,
  permissions,
  destination,
  formLabel,
  plainTextContent,
  openConfirm,
  onPublish,
  onArchive,
  onDelete,
  onSave,
  onCopyFullArticle,
  clipboardService,
}: ArticleDetailHeaderProps) {
  const { isNew, hasXArticleSections, isDirty, isSaving } = state;
  const { canPublish, canArchive } = permissions;
  const { isHostedOnWebsite, publicUrl } = destination;
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-sm text-foreground/60">
          {isNew ? 'Compose new article' : 'Article editor'}
        </p>
        <h1 className="text-2xl font-semibold">
          {isNew ? 'New Article' : formLabel || 'Untitled Article'}
        </h1>
      </div>

      <div className="flex max-w-full flex-wrap gap-2">
        {/* Publish */}
        {canPublish && (
          <Button
            label={
              isHostedOnWebsite ? 'Publish to genfeed.ai' : 'Mark published'
            }
            variant={ButtonVariant.DEFAULT}
            icon={<Rocket className="size-4" />}
            onClick={() =>
              openConfirm({
                cancelLabel: 'Cancel',
                confirmLabel: isHostedOnWebsite
                  ? 'Publish to genfeed.ai'
                  : 'Mark published',
                label: isHostedOnWebsite
                  ? 'Publish to genfeed.ai'
                  : 'Mark article published',
                message: isHostedOnWebsite
                  ? `This article goes live for anyone at ${publicUrl?.replace(/^https?:\/\//, '') ?? 'genfeed.ai/articles'} and appears on the genfeed.ai blog, RSS feed and sitemap.`
                  : 'This marks the article published in your workspace only. It is not posted anywhere and is not hosted on genfeed.ai. Share it through posts on your connected accounts.',
                onConfirm: onPublish,
              })
            }
          />
        )}

        {/* Archive */}
        {canArchive && (
          <Button
            label="Archive"
            variant={ButtonVariant.SECONDARY}
            icon={<Archive className="size-4" />}
            onClick={() =>
              openConfirm({
                cancelLabel: 'Cancel',
                confirmLabel: 'Archive',
                label: 'Archive Article',
                message: isHostedOnWebsite
                  ? 'Archiving takes this article off genfeed.ai, the blog, RSS feed and sitemap.'
                  : 'Are you sure you want to archive this article?',
                onConfirm: onArchive,
              })
            }
          />
        )}

        <Button
          label="Copy Article"
          variant={ButtonVariant.SECONDARY}
          size={ButtonSize.SM}
          icon={<Clipboard className="size-4" />}
          onClick={() =>
            void clipboardService.copyToClipboard(
              [formLabel.trim(), plainTextContent].filter(Boolean).join('\n\n'),
            )
          }
        />

        {/* Copy Full Article (X Article only) */}
        {hasXArticleSections && (
          <Button
            label="Copy for X Article"
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
            icon={<Clipboard className="size-4" />}
            onClick={onCopyFullArticle}
          />
        )}

        {/* Save */}
        <Button
          icon={
            isDirty ? (
              <CircleAlert className="size-4" />
            ) : (
              <Check className="size-4" />
            )
          }
          label={isSaving ? 'Saving...' : isDirty ? 'Save' : 'Saved'}
          variant={ButtonVariant.DEFAULT}
          size={ButtonSize.SM}
          className={
            isDirty
              ? 'bg-warning text-warning-foreground hover:bg-warning/90'
              : 'bg-success text-success-foreground hover:bg-success/90'
          }
          isLoading={isSaving}
          isDisabled={!isDirty || isSaving}
          onClick={onSave}
        />

        {/* Delete */}
        {!isNew && (
          <Button
            label="Delete"
            variant={ButtonVariant.DESTRUCTIVE}
            icon={<Trash2 className="size-4" />}
            onClick={() =>
              openConfirm({
                cancelLabel: 'Cancel',
                confirmLabel: 'Delete',
                isError: true,
                label: 'Delete Article',
                message:
                  'Are you sure you want to delete this article? This action cannot be undone.',
                onConfirm: onDelete,
              })
            }
          />
        )}
      </div>
    </div>
  );
}
