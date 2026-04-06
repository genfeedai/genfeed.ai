import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { type ComponentType, useCallback, useEffect, useState } from 'react';
import {
  InstagramQuickAction,
  LinkedInQuickAction,
  ManualUrlInput,
  TikTokQuickAction,
  TwitterQuickAction,
  YouTubeQuickAction,
} from '~components/quick-actions';
import { LoadingSpinner, RefreshIcon } from '~components/ui';
import {
  ContentDetectorService,
  type DetectedContent,
} from '~services/content-detector.service';
import { logger } from '~utils/logger.util';

interface QuickActionProps {
  content: DetectedContent;
}

const PLATFORM_COMPONENTS: Record<string, ComponentType<QuickActionProps>> = {
  instagram: InstagramQuickAction,
  linkedin: LinkedInQuickAction,
  tiktok: TikTokQuickAction,
  twitter: TwitterQuickAction,
  youtube: YouTubeQuickAction,
};

function NoContentDetected() {
  return (
    <div className="text-center py-6">
      <svg
        aria-hidden="true"
        className="h-12 w-12 mx-auto text-gray-400 mb-2"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
        />
      </svg>
      <p className="text-sm text-gray-500 mb-1">No content detected</p>
      <p className="text-xs text-gray-400">
        Navigate to YouTube, Twitter, LinkedIn, Instagram, or TikTok
      </p>
    </div>
  );
}

export function QuickActionsPage() {
  const [detectedContent, setDetectedContent] =
    useState<DetectedContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const detectContent = useCallback(async () => {
    setIsLoading(true);
    try {
      const detector = new ContentDetectorService();
      const content = await detector.detectCurrentTab();
      setDetectedContent(content);
    } catch (error) {
      logger.error('Error detecting content', error);
      setDetectedContent(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    detectContent();
  }, [detectContent]);

  function renderContent() {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner size="sm" />
        </div>
      );
    }

    if (!detectedContent?.platform) {
      return <NoContentDetected />;
    }

    const PlatformComponent = PLATFORM_COMPONENTS[detectedContent.platform];
    if (!PlatformComponent) {
      return <NoContentDetected />;
    }

    return <PlatformComponent content={detectedContent} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold">Quick Actions</h2>
        <Button
          type="button"
          variant={ButtonVariant.GHOST}
          onClick={detectContent}
          className="h-6 w-6"
          disabled={isLoading}
          title="Refresh detection"
        >
          <RefreshIcon className="h-4 w-4" />
        </Button>
      </div>

      {renderContent()}

      <div className="mt-4">
        <ManualUrlInput />
      </div>
    </div>
  );
}
