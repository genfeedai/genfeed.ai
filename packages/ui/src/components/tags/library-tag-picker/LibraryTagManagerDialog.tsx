'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant, TagScope } from '@genfeedai/contracts';
import { LIBRARY_ASSETS_REFRESH_EVENT } from '@genfeedai/contracts/constants';
import type { ITag } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { TagsService } from '@genfeedai/services/content/tags.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ui/primitives/dialog';
import { EditableText } from '@ui/primitives/editable-text';
import { Input } from '@ui/primitives/input';
import {
  Popover,
  PopoverPanelContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Settings2, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import LibraryTagChip from './LibraryTagChip';
import { dispatchLibraryTagUpdate } from './library-asset-tags-event';
import TagColorPicker from './TagColorPicker';
import { useLibraryTags } from './use-library-tags';

type CreatableScope = TagScope.BRAND | TagScope.ORGANIZATION;

/** `onUpdate` already logged and notified; the rejection only lets inline editors revert. */
function ignoreReportedFailure(): void {}

function refreshLibraryAssets(): void {
  window.dispatchEvent(new Event(LIBRARY_ASSETS_REFRESH_EVENT));
}

function TagManagerRow({
  onDelete,
  onUpdate,
  tag,
}: {
  onDelete: (tag: ITag) => Promise<void>;
  onUpdate: (
    tag: ITag,
    changes: Partial<Pick<ITag, 'backgroundColor' | 'label' | 'textColor'>>,
  ) => Promise<void>;
  tag: ITag;
}) {
  const translate = useTranslations('pages.library.tags');
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  // Legacy default tags have no owner and are read-only everywhere.
  const isReadOnly = tag.scope === TagScope.GLOBAL;

  return (
    <li className="flex items-center gap-2 py-1.5">
      <div className="min-w-0 flex-1">
        {isReadOnly ? (
          <LibraryTagChip tag={tag} />
        ) : (
          <EditableText
            ariaLabel={translate('renameTag', { label: tag.label })}
            isRequired
            maxLength={80}
            onSave={(label) => onUpdate(tag, { label })}
            value={tag.label}
          />
        )}
      </div>
      <span className="shrink-0 text-xs text-foreground/50">
        {tag.scope === TagScope.ORGANIZATION
          ? translate('scopeOrganization')
          : tag.scope === TagScope.GLOBAL
            ? translate('scopeDefault')
            : translate('scopeBrand')}
        {typeof tag.assetCount === 'number' ? ` · ${tag.assetCount}` : ''}
      </span>
      {isReadOnly ? (
        <span className="w-24 shrink-0 text-right text-xs text-foreground/50">
          {translate('readOnly')}
        </span>
      ) : (
        <>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                ariaLabel={translate('tagColor', { label: tag.label })}
                className="size-6 shrink-0 rounded-full border border-foreground/20"
                style={{
                  backgroundColor: tag.backgroundColor || undefined,
                }}
                type="button"
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
              />
            </PopoverTrigger>
            <PopoverPanelContent className="w-auto p-2">
              <TagColorPicker
                className="max-w-48"
                onChange={(swatch) => {
                  void onUpdate(tag, {
                    backgroundColor: swatch.backgroundColor,
                    textColor: swatch.textColor,
                  }).catch(ignoreReportedFailure);
                }}
                value={tag.backgroundColor}
              />
            </PopoverPanelContent>
          </Popover>
          <Button
            ariaLabel={
              isConfirmingDelete
                ? translate('confirmDelete', { label: tag.label })
                : translate('deleteTag', { label: tag.label })
            }
            icon={<Trash2 className="size-4" />}
            label={isConfirmingDelete ? translate('confirm') : undefined}
            onClick={() => {
              if (isConfirmingDelete) {
                void onDelete(tag);
              } else {
                setIsConfirmingDelete(true);
              }
            }}
            onBlur={() => setIsConfirmingDelete(false)}
            size={ButtonSize.SM}
            variant={
              isConfirmingDelete
                ? ButtonVariant.DESTRUCTIVE
                : ButtonVariant.GHOST
            }
            withWrapper={false}
          />
        </>
      )}
    </li>
  );
}

/**
 * Rename, recolor, delete and create tags for the active brand. Organization
 * wide tags are shared by every brand, so changing them needs an owner or
 * admin; the API refuses anyone else and this says so. Legacy default tags are
 * listed read-only. Deleting a tag removes it from every asset and keeps the
 * assets.
 */
export default function LibraryTagManagerDialog() {
  const translate = useTranslations('pages.library.tags');
  const { brandId } = useBrand();
  const { createTag, isLoading, refresh, tags } = useLibraryTags({
    brandId: brandId || undefined,
  });
  const getTagsService = useAuthedService((token: string) =>
    TagsService.getInstance(token),
  );
  const [newLabel, setNewLabel] = useState('');
  const [newScope, setNewScope] = useState<CreatableScope>(TagScope.BRAND);
  const [isCreating, setIsCreating] = useState(false);

  const handleUpdate = async (
    tag: ITag,
    changes: Partial<Pick<ITag, 'backgroundColor' | 'label' | 'textColor'>>,
  ): Promise<void> => {
    try {
      const service = await getTagsService();
      await service.patch(tag.id, changes);
      await refresh();
      dispatchLibraryTagUpdate({ id: tag.id, ...changes });
    } catch (error: unknown) {
      logger.error('Failed to update Library tag', error);
      NotificationsService.getInstance().error(translate('manageFailed'));
      throw error;
    }
  };

  const handleDelete = async (tag: ITag): Promise<void> => {
    try {
      const service = await getTagsService();
      await service.removeTag(tag.id);
      await refresh();
      refreshLibraryAssets();
      NotificationsService.getInstance().success(
        translate('deleted', { label: tag.label }),
      );
    } catch (error: unknown) {
      logger.error('Failed to delete Library tag', error);
      NotificationsService.getInstance().error(translate('manageFailed'));
    }
  };

  const handleCreate = async (): Promise<void> => {
    const label = newLabel.trim();
    if (!label) {
      return;
    }

    setIsCreating(true);
    try {
      await createTag(label, newScope);
      setNewLabel('');
    } catch (error: unknown) {
      logger.error('Failed to create Library tag', error);
      NotificationsService.getInstance().error(
        newScope === TagScope.ORGANIZATION
          ? translate('organizationTagDenied')
          : translate('createFailed'),
      );
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          ariaLabel={translate('manageTags')}
          className="h-control-sm rounded-full px-2 text-xs text-foreground/50 hover:text-foreground"
          icon={<Settings2 className="size-3.5" />}
          tooltip={translate('manageTags')}
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{translate('manageTags')}</DialogTitle>
          <DialogDescription>
            {translate('manageDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input
            aria-label={translate('newTagLabel')}
            className="min-w-0 flex-1"
            maxLength={80}
            onChange={(event) => setNewLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void handleCreate();
              }
            }}
            placeholder={translate('newTagPlaceholder')}
            value={newLabel}
          />
          <Select
            onValueChange={(value) =>
              setNewScope(
                value === TagScope.ORGANIZATION
                  ? TagScope.ORGANIZATION
                  : TagScope.BRAND,
              )
            }
            value={newScope}
          >
            <SelectTrigger
              aria-label={translate('newTagScope')}
              className="w-36"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TagScope.BRAND}>
                {translate('scopeThisBrand')}
              </SelectItem>
              <SelectItem value={TagScope.ORGANIZATION}>
                {translate('scopeOrganization')}
              </SelectItem>
            </SelectContent>
          </Select>
          <Button
            isDisabled={!newLabel.trim()}
            isLoading={isCreating}
            label={translate('createButton')}
            onClick={() => {
              void handleCreate();
            }}
            variant={ButtonVariant.DEFAULT}
          />
        </div>

        {isLoading ? (
          <p className="text-sm text-foreground/60" role="status">
            {translate('loading')}
          </p>
        ) : tags.length === 0 ? (
          <p className="text-sm text-foreground/60">
            {translate('emptyGuidance')}
          </p>
        ) : (
          <ul className="max-h-80 divide-y divide-foreground/6 overflow-y-auto">
            {tags.map((tag) => (
              <TagManagerRow
                key={tag.id}
                onDelete={handleDelete}
                onUpdate={handleUpdate}
                tag={tag}
              />
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
