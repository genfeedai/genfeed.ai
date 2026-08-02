'use client';

import type { Video } from '@models/ingredients/video.model';
import Card from '@ui/card/Card';
import { LazyMasonryVideo } from '@ui/lazy/masonry/LazyMasonry';

type Props = {
  recentVideos: Video[];
};

export default function AnalyticsRecentVideos({ recentVideos }: Props) {
  if (recentVideos.length === 0) {
    return null;
  }

  return (
    <Card>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-semibold">Recent Videos</h2>
          <p className="text-sm text-foreground/60 mt-1">
            Your latest video creations with performance metrics
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
        {recentVideos.map((video: Video, index: number) => (
          <div
            key={video.id}
            className="break-inside-avoid"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div className="relative group">
              <LazyMasonryVideo video={video} isActionsEnabled={false} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
