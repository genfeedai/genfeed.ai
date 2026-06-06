'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { resolveIngredientReferenceUrl } from '@utils/media/reference.util';
import Image from 'next/image';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';

type StudioEditDetailVersionHistoryProps = {
  processingAssets: Map<string, IIngredient>;
  results: IIngredient[];
  onResultClick: (id: string) => void;
};

export default function StudioEditDetailVersionHistory({
  processingAssets,
  results,
  onResultClick,
}: StudioEditDetailVersionHistoryProps) {
  if (results.length === 0 && processingAssets.size === 0) {
    return null;
  }

  return (
    <div className="mb-4">
      <h3 className="text-lg font-semibold mb-4">Version History</h3>
      <div className="space-y-3">
        {Array.from(processingAssets.values()).map((asset) => {
          const referenceImageUrl = resolveIngredientReferenceUrl(
            asset.references,
          );

          return (
            <Card key={asset.id} className="p-3 bg-card">
              <div className="aspect-video bg-background overflow-hidden relative mb-2">
                {referenceImageUrl ? (
                  <Image
                    src={referenceImageUrl}
                    alt="Processing preview"
                    className="w-full h-full object-cover"
                    width={asset.width || 1920}
                    height={asset.height || 1080}
                  />
                ) : (
                  <div className="w-full h-full bg-muted animate-pulse" />
                )}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <div className="size-8 rounded-full bg-white/20 animate-pulse" />
                </div>
              </div>
              <p className="font-medium text-sm">Processing…</p>
              <p className="text-xs text-foreground/60">
                <ClientFormattedDate
                  format="date"
                  locales="en-US"
                  options={{
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    month: 'short',
                  }}
                  value="now"
                />
              </p>
            </Card>
          );
        })}

        {results.map((result) => (
          <Button
            key={result.id}
            type="button"
            variant={ButtonVariant.UNSTYLED}
            onClick={() => onResultClick(result.id)}
            className="cursor-pointer w-full text-left bg-transparent border-0 p-0"
          >
            <Card className="p-3 bg-card hover:shadow-lg transition-all">
              <div className="aspect-video bg-background overflow-hidden mb-2">
                {result.thumbnailUrl ? (
                  <Image
                    src={result.thumbnailUrl}
                    alt="Version"
                    className="w-full h-full object-cover"
                    width={result.width || 1920}
                    height={result.height || 1080}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-foreground/30">
                    No preview
                  </div>
                )}
              </div>
              <p className="font-medium text-sm mb-1">
                {result.metadataLabel || 'Version'}
              </p>
              <p className="text-xs text-foreground/60">
                <ClientFormattedDate
                  format="date"
                  locales="en-US"
                  options={{
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    month: 'short',
                  }}
                  value={result.createdAt}
                />
              </p>
              {result.promptText && (
                <p className="text-xs text-foreground/80 line-clamp-2 mt-2">
                  {result.promptText}
                </p>
              )}
            </Card>
          </Button>
        ))}
      </div>
    </div>
  );
}
