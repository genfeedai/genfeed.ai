'use client';

import { ComponentSize } from '@genfeedai/enums';
import Spinner from '@ui/feedback/spinner/Spinner';
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
      <div className=" border border-white/[0.08] bg-card p-4">
        <label className="mb-2 block text-sm font-medium">
          {generatedImageUrl ? 'Generated Image Preview' : 'Processing…'}
        </label>

        <div className="relative w-full overflow-hidden">
          {generatedImageUrl ? (
            <Image
              src={generatedImageUrl}
              alt="Generated illustration"
              className="h-auto w-full object-contain"
              width={dimensions.width}
              height={dimensions.height}
            />
          ) : (
            <div
              className="flex items-center justify-center bg-background animate-pulse"
              style={{
                aspectRatio: `${dimensions.width}/${dimensions.height}`,
              }}
            >
              <Spinner size={ComponentSize.LG} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
