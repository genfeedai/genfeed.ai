'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { BrandDetailReferencesCardProps } from '@props/pages/brand-detail.props';
import { EnvironmentService } from '@services/core/environment.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import { HiArrowUpTray, HiTrash } from 'react-icons/hi2';

export default function BrandDetailReferencesCard({
  brand,
  deletingRefId,
  onUploadReference,
  onDeleteReference,
}: BrandDetailReferencesCardProps) {
  const hasReferences = brand?.references && brand.references.length > 0;

  return (
    <Card>
      <h2 className="text-lg font-semibold mb-4">Branding References</h2>
      {hasReferences ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-4">
            {brand.references?.map((ref) => (
              <div key={ref.id} className="relative w-full aspect-square group">
                <Image
                  src={`${EnvironmentService.ingredientsEndpoint}/references/${ref.id}`}
                  alt={`Reference ${ref.id}`}
                  className="w-full h-full object-cover"
                  width={300}
                  height={300}
                />

                <div className="absolute inset-0 flex items-start justify-end p-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/0 group-hover:bg-black/20">
                  <Button
                    label={<HiTrash />}
                    ariaLabel="Delete reference"
                    variant={ButtonVariant.DESTRUCTIVE}
                    size={ButtonSize.XS}
                    isDisabled={deletingRefId === ref.id}
                    onClick={() => onDeleteReference(ref.id)}
                  />
                </div>
              </div>
            ))}
          </div>
          <Button
            variant={ButtonVariant.SECONDARY}
            className="w-full gap-2"
            wrapperClassName="w-full"
            onClick={onUploadReference}
            label={
              <>
                <HiArrowUpTray />
                Upload Reference
              </>
            }
          />
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground mb-2">
            Add branding assets to reference when generating content in Studio.
          </p>

          <Button
            variant={ButtonVariant.DEFAULT}
            className="w-full gap-2"
            wrapperClassName="w-full"
            onClick={onUploadReference}
            label={
              <>
                <HiArrowUpTray />
                Upload Reference
              </>
            }
          />
        </div>
      )}
    </Card>
  );
}
