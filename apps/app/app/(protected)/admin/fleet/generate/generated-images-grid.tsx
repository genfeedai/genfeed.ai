'use client';

import type { IFleetGenerationJob } from '@genfeedai/interfaces';
import Card from '@ui/card/Card';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import Image from 'next/image';

type GeneratedImage = {
  id: string;
  jobId?: string;
  cdnUrl: string;
  prompt: string;
  model: string;
  createdAt: string;
  progress?: number;
  stage?: string;
  status?: IFleetGenerationJob['status'];
  error?: string;
};

type GeneratedImagesGridProps = {
  images: GeneratedImage[];
};

export default function GeneratedImagesGrid({
  images,
}: GeneratedImagesGridProps) {
  if (images.length === 0) {
    return null;
  }

  return (
    <WorkspaceSurface
      className="mt-6"
      title="Generated Images"
      tone="muted"
      data-testid="fleet-generated-images-surface"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {images.map((img) => (
          <Card key={img.id}>
            <div className="p-4">
              {img.cdnUrl ? (
                <Image
                  unoptimized
                  alt={img.prompt}
                  className="w-full rounded mb-3 aspect-square object-cover"
                  src={img.cdnUrl}
                  width={800}
                  height={600}
                />
              ) : (
                <div className="w-full rounded mb-3 aspect-square bg-foreground/5 flex items-center justify-center text-foreground/30">
                  Processing…
                </div>
              )}
              <p className="text-sm text-foreground/70 line-clamp-2">
                {img.prompt}
              </p>
              <p className="text-xs text-foreground/40 mt-1">
                {img.model.replace('genfeed-ai/', '')}
              </p>
              {img.status && img.status !== 'completed' && (
                <div className="mt-3 space-y-1">
                  <div className="flex items-center justify-between text-xs text-foreground/50">
                    <span>{img.stage || img.status}</span>
                    <span>{img.progress ?? 0}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-foreground/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${img.progress ?? 0}%` }}
                    />
                  </div>
                </div>
              )}
              {img.error && (
                <p className="text-xs text-error mt-2">{img.error}</p>
              )}
            </div>
          </Card>
        ))}
      </div>
    </WorkspaceSurface>
  );
}
