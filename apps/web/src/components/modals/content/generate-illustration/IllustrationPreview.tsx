'use client';

import { ComponentSize } from '@genfeedai/contracts';
import { Label } from '@ui/primitives/label';
import { Skeleton } from '@ui/primitives/skeleton';
import Spinner from '@ui/primitives/spinner';
import Image from 'next/image';

type Props = {
  generatedImageUrl: string | null;
  dimensions: { width: number; height: number };
};

export default function IllustrationPreview({
  generatedImageUrl,
  dimensions,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 bg-card shadow-border p-4">
        <Label>
          {generatedImageUrl ? 'Generated Image Preview' : 'Processing…'}
        </Label>

        <div className="relative w-full overflow-hidden">
          {generatedImageUrl ? (
            <Image
              src={generatedImageUrl}
              alt="Generated illustration"
              className="h-auto w-full object-contain outline-media"
              width={dimensions.width}
              height={dimensions.height}
            />
          ) : (
            <Skeleton
              className="flex items-center justify-center"
              style={{
                aspectRatio: `${dimensions.width}/${dimensions.height}`,
              }}
            >
              <Spinner size={ComponentSize.LG} />
            </Skeleton>
          )}
        </div>
      </div>
    </div>
  );
}
