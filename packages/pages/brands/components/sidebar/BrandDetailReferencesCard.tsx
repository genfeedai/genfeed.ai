'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { BrandDetailReferencesCardProps } from '@props/pages/brand-detail.props';
import { EnvironmentService } from '@services/core/environment.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Trash2, Upload } from 'lucide-react';
import Image from 'next/image';

export default function BrandDetailReferencesCard({
  brand,
  deletingRefId,
  onUploadReference,
  onDeleteReference,
}: BrandDetailReferencesCardProps) {
  const hasReferences = brand?.references && brand.references.length > 0;

  return (
    <Card
      label="Branding References"
      description="Assets referenced when generating content in Studio."
    >
      {hasReferences ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {brand.references?.map((ref) => (
              <div key={ref.id} className="group relative aspect-square w-full">
                <Image
                  src={`${EnvironmentService.cdnUrl}/references/${ref.id}`}
                  alt={`Reference ${ref.id}`}
                  className="size-full object-cover"
                  width={300}
                  height={300}
                />

                <div
                  className={
                    'absolute inset-0 flex items-start justify-end bg-black/0 p-1.5 opacity-0 transition-opacity group-hover:bg-black/20 group-hover:opacity-100' /* design-system-allow-content-color */
                  }
                >
                  <Button
                    icon={<Trash2 className="size-3.5" />}
                    ariaLabel="Delete reference"
                    variant={ButtonVariant.DESTRUCTIVE}
                    size={ButtonSize.ICON}
                    className="size-8 p-0 [&_svg]:size-3.5"
                    isDisabled={deletingRefId === ref.id}
                    onClick={() => onDeleteReference(ref.id)}
                  />
                </div>
              </div>
            ))}
          </div>
          <Button
            variant={ButtonVariant.SECONDARY}
            className="w-full gap-1.5 text-xs [&_svg]:size-3.5"
            size={ButtonSize.SM}
            wrapperClassName="w-full"
            onClick={onUploadReference}
            icon={<Upload className="size-3.5" />}
            label="Upload reference"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="rounded-md bg-background-secondary/50 px-3 py-3 text-xs text-muted-foreground">
            No reference assets yet.
          </div>
          <Button
            variant={ButtonVariant.DEFAULT}
            className="w-full gap-1.5 text-xs [&_svg]:size-3.5"
            size={ButtonSize.SM}
            wrapperClassName="w-full"
            onClick={onUploadReference}
            icon={<Upload className="size-3.5" />}
            label="Upload reference"
          />
        </div>
      )}
    </Card>
  );
}
