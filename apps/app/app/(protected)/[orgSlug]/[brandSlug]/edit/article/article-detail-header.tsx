'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { GlobalModalsContextValue } from '@providers/global-modals/global-modals.provider';
import type { ClipboardService } from '@services/core/clipboard.service';
import { Button } from '@ui/primitives/button';
import {
  Archive,
  Check,
  CircleAlert,
  Clipboard,
  Rocket,
  Trash2,
} from 'lucide-react';

type ArticleDetailHeaderState = {
  isNew: boolean;
  hasXArticleSections: boolean;
  isDirty: boolean;
  isSaving: boolean;
};

type ArticleDetailHeaderPermissions = {
  canPublish: boolean;
  canArchive: boolean;
};

type ArticleDetailHeaderProps = {
  state: ArticleDetailHeaderState;
  permissions: ArticleDetailHeaderPermissions;
  formLabel: string;
  plainTextContent: string;
  openConfirm: GlobalModalsContextValue['openConfirm'];
  onPublish: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onSave: () => void;
  onCopyFullArticle: () => void;
  clipboardService: ClipboardService;
};

export default function ArticleDetailHeader({
  state,
  permissions,
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
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-sm text-foreground/60">
          {isNew ? 'Compose new article' : 'Article editor'}
        </p>
        <h2 className="text-2xl font-semibold">
          {isNew ? 'New Article' : formLabel || 'Untitled Article'}
        </h2>
      </div>

      <div className="flex gap-2">
        {/* Publish */}
        {canPublish && (
          <Button
            label="Publish"
            variant={ButtonVariant.DEFAULT}
            icon={<Rocket className="size-4" />}
            onClick={() =>
              openConfirm({
                cancelLabel: 'Cancel',
                confirmLabel: 'Publish',
                label: 'Publish Article',
                message:
                  'Are you sure you want to publish this article? It will be visible to the public.',
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
                message:
                  'Are you sure you want to archive this article? It will be hidden from public view.',
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
