import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { useCallback, useEffect, useState } from 'react';
import {
  EmptyState,
  LoadingPage,
  RefreshIcon,
  VideoIcon,
} from '~components/ui';

interface Video {
  id: string;
  title: string;
  thumbnail?: string;
  duration?: string;
  views?: number;
  createdAt: string;
  url: string;
  status: 'processing' | 'completed' | 'failed';
}

const STATUS_BADGE_CLASSES: Record<Video['status'], string> = {
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  processing: 'bg-yellow-100 text-yellow-800',
};

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatViews(views: number): string {
  if (views >= 1000000) {
    return `${(views / 1000000).toFixed(1)}M`;
  }
  if (views >= 1000) {
    return `${(views / 1000).toFixed(1)}K`;
  }
  return views.toString();
}

function openVideo(url: string): void {
  chrome.tabs.create({ url });
}

export default function VideosPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadVideos = useCallback(() => {
    setIsLoading(true);
    setError('');

    chrome.runtime.sendMessage({ event: 'getVideos' }, (response) => {
      setIsLoading(false);

      if (response?.success && response.videos) {
        setVideos(response.videos);
      } else {
        setError(response?.error || 'Failed to load videos');
      }
    });
  }, []);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  if (isLoading) {
    return <LoadingPage />;
  }

  if (error) {
    return (
      <EmptyState
        title={error}
        action={
          <Button
            type="button"
            variant={ButtonVariant.LINK}
            onClick={loadVideos}
            className="text-blue-600 hover:text-blue-700"
          >
            Try again
          </Button>
        }
      />
    );
  }

  if (videos.length === 0) {
    return (
      <EmptyState
        icon={<VideoIcon />}
        title="No videos yet"
        description="Create your first video using the prompt tab"
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-700">
          Your Videos ({videos.length})
        </h3>
        <Button
          type="button"
          variant={ButtonVariant.GHOST}
          onClick={loadVideos}
          className="text-blue-600 hover:text-blue-700"
          title="Refresh"
        >
          <RefreshIcon />
        </Button>
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {videos.map((video) => (
          <Button
            type="button"
            variant={ButtonVariant.UNSTYLED}
            key={video.id}
            className="w-full text-left border border-gray-200 p-3 hover:border-gray-300 transition-colors cursor-pointer"
            onClick={() => openVideo(video.url)}
          >
            <div className="flex gap-3">
              {video.thumbnail && (
                <img
                  src={video.thumbnail}
                  alt={video.title}
                  className="w-24 h-16 object-cover"
                />
              )}

              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium text-gray-900 line-clamp-2">
                  {video.title}
                </h4>

                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                  {video.views !== undefined && (
                    <span>{formatViews(video.views)} views</span>
                  )}
                  <span>{formatDate(video.createdAt)}</span>
                </div>

                <div className="mt-2">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[video.status]}`}
                  >
                    {video.status}
                  </span>
                </div>
              </div>
            </div>
          </Button>
        ))}
      </div>
    </div>
  );
}
