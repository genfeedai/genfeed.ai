import { useState } from 'react';
import { LoadingSpinner } from '~components/ui';
import type { DetectedContent } from '~services/content-detector.service';
import { logger } from '~utils/logger.util';

export function YouTubeQuickAction({ content }: { content: DetectedContent }) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSendTranscript = async () => {
    setIsProcessing(true);

    try {
      const response = await chrome.runtime.sendMessage({
        payload: { youtubeUrl: content.url },
        type: 'PROCESS_YOUTUBE_TRANSCRIPT',
      });

      if (response.success) {
        alert('✅ Transcript processing started! Check the Transcripts tab.');
      } else {
        alert(`❌ Failed: ${response.error || 'Unknown error'}`);
      }
    } catch (error) {
      logger.error('Error sending transcript', error);
      alert('❌ Failed to start transcript processing');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className=" border border-white/[0.08] bg-muted text-card-foreground shadow-sm mb-4">
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <svg
            aria-hidden="true"
            className="w-5 h-5 text-red-600"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
          </svg>
          <span className="text-xs font-semibold text-muted-foreground">
            YouTube Video
          </span>
        </div>

        <div className="flex gap-3">
          {content.videoThumbnail && (
            <img
              src={content.videoThumbnail}
              alt="Video thumbnail"
              className="w-32 h-20 object-cover flex-shrink-0"
            />
          )}

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm line-clamp-2">
              {content.videoTitle || 'YouTube Video'}
            </h3>
            {content.channelName && (
              <p className="text-xs text-muted-foreground mt-1">
                {content.channelName}
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleSendTranscript}
          className="inline-flex items-center justify-center gap-2 h-8 px-3 mt-3 w-full text-xs font-medium bg-primary text-primary-foreground shadow hover:bg-primary/90 transition-colors disabled:pointer-events-none disabled:opacity-50"
          disabled={isProcessing}
        >
          {isProcessing ? (
            <>
              <LoadingSpinner size="sm" />
              Processing...
            </>
          ) : (
            'Generate Transcript & Article'
          )}
        </button>
      </div>
    </div>
  );
}
