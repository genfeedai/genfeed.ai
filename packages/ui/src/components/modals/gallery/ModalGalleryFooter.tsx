'use client';

import {
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
} from '@genfeedai/enums';
import type { IAsset } from '@genfeedai/interfaces';
import type { ModalGalleryFooterProps } from '@props/modals/modal-gallery.props';
import { PagesService } from '@services/content/pages.service';
import { EnvironmentService } from '@services/core/environment.service';
import Pagination from '@ui/navigation/pagination/Pagination';
import { Button } from '@ui/primitives/button';

export default function ModalGalleryFooter({
  category,
  activeTab,
  isLoading,
  selectedItems,
  selectedItemsData,
  selectedItem,
  isNoneAllowed,
  onClear,
  onSelect,
  onSelectAccountReference,
  onClose,
  onConfirm,
  onPageChange,
}: ModalGalleryFooterProps) {
  return (
    <div className="border-t border-white/[0.08] p-4 mt-4">
      <div className="flex justify-between items-center mb-4">
        {/* Pagination on the left */}
        <div className="flex items-center">
          {!isLoading && (
            <Pagination
              currentPage={PagesService.getCurrentPage()}
              totalPages={PagesService.getTotalPages()}
              onPageChange={onPageChange}
            />
          )}
        </div>

        {/* Action buttons to the right */}
        <div className="flex items-center gap-2">
          {/* Image action buttons - references tab */}
          {category === IngredientCategory.IMAGE &&
            activeTab === 'references' &&
            selectedItems.length > 0 && (
              <>
                <Button
                  variant={ButtonVariant.OUTLINE}
                  size={ButtonSize.SM}
                  label="Clear"
                  onClick={onClear}
                />

                <Button
                  label={`Select References (${selectedItems.length})`}
                  variant={ButtonVariant.DEFAULT}
                  size={ButtonSize.SM}
                  onClick={() => {
                    const referencesData = selectedItems.map((id) => ({
                      id,
                      url: `${EnvironmentService.ingredientsEndpoint}/references/${id}`,
                    })) as unknown as IAsset[];

                    if (onSelectAccountReference && referencesData.length > 0) {
                      onSelectAccountReference(referencesData);
                    }
                    onClose();
                  }}
                />
              </>
            )}

          {/* Image action buttons - media tab */}
          {category === IngredientCategory.IMAGE &&
            activeTab === 'media' &&
            selectedItems.length > 0 && (
              <>
                <Button
                  label="Clear"
                  variant={ButtonVariant.OUTLINE}
                  size={ButtonSize.SM}
                  onClick={onClear}
                />

                <Button
                  label={`Select Images (${selectedItems.length})`}
                  variant={ButtonVariant.DEFAULT}
                  size={ButtonSize.SM}
                  onClick={() => {
                    if (selectedItemsData.length > 0) {
                      onSelect(
                        selectedItemsData.length === 1
                          ? selectedItemsData[0]
                          : selectedItemsData,
                      );
                    }
                    onClose();
                  }}
                />
              </>
            )}

          {/* Image action buttons - uploads tab */}
          {category === IngredientCategory.IMAGE &&
            activeTab === 'uploads' &&
            selectedItems.length > 0 && (
              <>
                <Button
                  label="Clear"
                  variant={ButtonVariant.OUTLINE}
                  size={ButtonSize.SM}
                  onClick={onClear}
                />

                <Button
                  label={`Select Images (${selectedItems.length})`}
                  variant={ButtonVariant.DEFAULT}
                  size={ButtonSize.SM}
                  onClick={() => {
                    if (selectedItemsData.length > 0) {
                      onSelect(
                        selectedItemsData.length === 1
                          ? selectedItemsData[0]
                          : selectedItemsData,
                      );
                    }
                    onClose();
                  }}
                />
              </>
            )}

          {/* Music action buttons */}
          {category === IngredientCategory.MUSIC && (
            <div className="flex gap-2">
              {selectedItem && (
                <Button
                  label="Clear"
                  onClick={() => onSelect(null)}
                  variant={ButtonVariant.DESTRUCTIVE}
                  size={ButtonSize.SM}
                />
              )}

              <Button
                label="Cancel"
                onClick={onClose}
                variant={ButtonVariant.GHOST}
              />

              <Button
                label={selectedItem ? 'Select Music' : 'Continue Without Music'}
                onClick={onConfirm}
                variant={ButtonVariant.DEFAULT}
                isDisabled={!isNoneAllowed && !selectedItem}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
