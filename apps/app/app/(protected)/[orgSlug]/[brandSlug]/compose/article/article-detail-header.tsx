'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { GlobalModalsContextValue } from '@providers/global-modals/global-modals.provider';
import type { ClipboardService } from '@services/core/clipboard.service';
import { Button } from '@ui/primitives/button';
import {
  HiArchiveBox,
  HiCheck,
  HiClipboardDocument,
  HiExclamationCircle,
  HiEye,
  HiPencil,
  HiRocketLaunch,
  HiTrash,
} from 'react-icons/hi2';

type ViewMode = 'edit' | 'preview';

type ArticleDetailHeaderProps = {
  isNew: boolean;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  canPublish: boolean;
  canArchive: boolean;
  hasXArticleSections: boolean;
  isDirty: boolean;
  isSaving: boolean;
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
  isNew,
  viewMode,
  setViewMode,
  canPublish,
  canArchive,
  hasXArticleSections,
  isDirty,
  isSaving,
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

      <div className="flex gap-2">
        {/* View mode toggle */}
        {!isNew && (
          <Button
            label={viewMode === 'edit' ? 'Preview' : 'Edit'}
            variant={ButtonVariant.SECONDARY}
            onClick={() =>
              setViewMode(viewMode === 'edit' ? 'preview' : 'edit')
            }
            icon={
              viewMode === 'edit' ? (
                <HiEye className="size-4" />
              ) : (
                <HiPencil className="size-4" />
              )
            }
          />
        )}

        {/* Publish */}
        {canPublish && (
          <Button
            label="Publish"
            variant={ButtonVariant.DEFAULT}
            icon={<HiRocketLaunch className="size-4" />}
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
            icon={<HiArchiveBox className="size-4" />}
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
          icon={<HiClipboardDocument className="size-4" />}
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
            icon={<HiClipboardDocument className="size-4" />}
            onClick={onCopyFullArticle}
          />
        )}

        {/* Save */}
        <Button
          icon={
            isDirty ? (
              <HiExclamationCircle className="size-4" />
            ) : (
              <HiCheck className="size-4" />
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
            icon={<HiTrash className="size-4" />}
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
