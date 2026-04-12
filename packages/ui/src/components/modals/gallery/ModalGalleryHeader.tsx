'use client';

import { useUploadModal } from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import {
  AlertCategory,
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
} from '@genfeedai/enums';
import { formatVideos } from '@genfeedai/helpers/data/data/data.helper';
import type { ModalGalleryHeaderProps } from '@genfeedai/props/modals/modal-gallery.props';
import Badge from '@ui/display/badge/Badge';
import Alert from '@ui/feedback/alert/Alert';
import Tabs from '@ui/navigation/tabs/Tabs';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import { HiArrowUpTray } from 'react-icons/hi2';

export default function ModalGalleryHeader({
  category,
  activeTab,
  localFormat,
  filterReferenceId,
  tabs,
  accountReference,
  onTabChange,
  onClearFilter,
  onUseAccountReference,
}: ModalGalleryHeaderProps) {
  const { openUpload } = useUploadModal({
    onConfirm: () => {
      // Refresh gallery after upload
      window.location.reload();
    },
  });

  const handleUploadClick = () => {
    openUpload({
      category: IngredientCategory.IMAGE,
    });
  };

  return (
    <>
      {/* Account reference section */}
      {category === IngredientCategory.IMAGE && accountReference && (
        <div className="mb-4 flex items-center gap-3 p-3 bg-background">
          <div className="relative w-10 h-10 flex-shrink-0 overflow-hidden">
            <Image
              src={accountReference.url}
              alt="Account reference"
              fill
              sizes="40px"
              className="object-cover"
            />
          </div>

          <Button
            label="Use Account Reference"
            variant={ButtonVariant.DEFAULT}
            size={ButtonSize.SM}
            onClick={onUseAccountReference}
          />
        </div>
      )}

      {/* Tabs - only show for images */}
      {category === IngredientCategory.IMAGE && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3 flex-1">
              <Tabs
                activeTab={activeTab}
                onTabChange={(tab) =>
                  onTabChange(tab as 'media' | 'references' | 'uploads')
                }
                tabs={tabs}
              />

              {/* Upload Button */}
              <Button
                label="Upload"
                icon={<HiArrowUpTray className="w-4 h-4" />}
                variant={ButtonVariant.DEFAULT}
                size={ButtonSize.SM}
                onClick={handleUploadClick}
              />
            </div>

            {/* Format display - read-only, comes from promptbar */}
            {(activeTab === 'media' || activeTab === 'references') && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-sm font-medium">
                  Format:{' '}
                  {formatVideos.find((f) => f.id === localFormat)?.label ||
                    localFormat}
                </Badge>
              </div>
            )}
          </div>

          {/* Format description - explain it comes from promptbar */}
          {(activeTab === 'media' || activeTab === 'references') && (
            <Alert type={AlertCategory.INFO} className="mb-3 p-2 text-xs">
              <strong>Note:</strong> References must match the format selected
              in the promptbar.
            </Alert>
          )}

          {activeTab === 'media' && filterReferenceId && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              <Badge variant="outline">Filtered by references</Badge>

              <Button
                label="Clear"
                variant={ButtonVariant.GHOST}
                size={ButtonSize.XS}
                onClick={onClearFilter}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}
