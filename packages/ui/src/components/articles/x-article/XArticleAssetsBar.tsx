'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { XArticleAssetsBarProps } from '@props/content/x-article.props';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import {
  HiArrowDownTray,
  HiClipboardDocument,
  HiClock,
  HiPhoto,
} from 'react-icons/hi2';

export default function XArticleAssetsBar({
  article,
  metadata,
  onCopyFullArticle,
  onDownloadImage,
  onGenerateHeaderImage,
  isGeneratingImage,
}: XArticleAssetsBarProps) {
  const hasHeaderImage = !!metadata.headerImageUrl;

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-4">
        {/* Stats */}
        <div className="flex items-center gap-4 text-sm text-foreground/60">
          <span>{metadata.wordCount.toLocaleString()} words</span>
          <span className="flex items-center gap-1">
            <HiClock className="h-4 w-4" />
            {metadata.estimatedReadTime} min read
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Copy Full Article */}
          <Button
            label="Copy Full Article"
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
            icon={<HiClipboardDocument className="h-4 w-4" />}
            onClick={onCopyFullArticle}
          />

          {/* Header Image */}
          {hasHeaderImage ? (
            <div className="flex items-center gap-2">
              <div className="relative h-10 w-16 overflow-hidden rounded border border-white/[0.08]">
                <Image
                  src={metadata.headerImageUrl as string}
                  alt={`${article.label} header`}
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              </div>
              <Button
                label="Download"
                variant={ButtonVariant.GHOST}
                size={ButtonSize.SM}
                icon={<HiArrowDownTray className="h-4 w-4" />}
                onClick={() =>
                  onDownloadImage(
                    metadata.headerImageUrl as string,
                    `${article.slug || article.id}-header.jpg`,
                  )
                }
              />
            </div>
          ) : (
            <Button
              label={
                isGeneratingImage ? 'Generating...' : 'Generate Header Image'
              }
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.SM}
              icon={<HiPhoto className="h-4 w-4" />}
              isLoading={isGeneratingImage}
              isDisabled={isGeneratingImage}
              onClick={onGenerateHeaderImage}
            />
          )}
        </div>
      </div>
    </Card>
  );
}
