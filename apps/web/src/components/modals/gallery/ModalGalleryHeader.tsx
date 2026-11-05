'use client';

import { useUploadModal } from '@genfeedai/contexts/providers/global-modals/global-modals.hooks';
import {
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
} from '@genfeedai/contracts';
import { formatVideos } from '@genfeedai/helpers/data/data/data.helper';
import type { ModalGalleryHeaderProps } from '@genfeedai/props/modals/modal-gallery.props';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Tabs } from '@ui/primitives/tabs';
import { Upload } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

/**
 * One row above the picker's content: the Library / Branding switch for image
 * pickers, the brand's account reference when the caller offers one, and an
 * Upload that drops the new file straight into the grid.
 */
export default function ModalGalleryHeader({
  category,
  activeTab,
  localFormat,
  tabs,
  accountReference,
  onTabChange,
  onUseAccountReference,
  onUploaded,
}: ModalGalleryHeaderProps) {
  const translate = useTranslations('ui.galleryModal');
  const { openUpload } = useUploadModal({ onComplete: onUploaded });
  const isMusic = category === IngredientCategory.MUSIC;
  const hasTabs = tabs.length > 1;

  if (isMusic && !hasTabs) {
    return null;
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3">
      {hasTabs ? (
        <Tabs
          activeTab={activeTab}
          onTabChange={(tab) =>
            onTabChange(tab === 'references' ? tab : 'media')
          }
          tabs={tabs.map((tab) => ({
            id: tab.id,
            label:
              tab.id === 'references'
                ? translate('branding')
                : translate('library'),
          }))}
        />
      ) : null}

      {activeTab === 'references' ? (
        <Badge variant="outline">
          {formatVideos.find((f) => f.id === localFormat)?.label || localFormat}
        </Badge>
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        {category === IngredientCategory.IMAGE && accountReference ? (
          <Button
            icon={
              <span className="relative size-5 overflow-hidden rounded-sm">
                <Image
                  src={accountReference.url}
                  alt=""
                  fill
                  sizes="20px"
                  className="object-cover"
                />
              </span>
            }
            label={translate('useAccountReference')}
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
            onClick={onUseAccountReference}
          />
        ) : null}

        {isMusic ? null : (
          <Button
            label={translate('upload')}
            icon={<Upload className="size-4" />}
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
            onClick={() => openUpload({ category })}
          />
        )}
      </div>
    </div>
  );
}
