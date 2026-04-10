import { ComponentSize } from '@genfeedai/enums';
import type { VideoPlayerProps } from '@genfeedai/props/studio/video-player.props';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { logger } from '@genfeedai/services/core/logger.service';
import Spinner from '@ui/feedback/spinner/Spinner';
import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';

export default function VideoPlayer({
  videoRef,
  src = '',
  thumbnail = '',
  priority = false,
  className = '',
  config = {
    autoPlay: false,
    controls: true,
    loop: false,
    muted: false,
    playsInline: true,
    preload: 'metadata',
  },
}: VideoPlayerProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isMetadataLoaded, setIsMetadataLoaded] = useState(false);
  const [showLoader, setShowLoader] = useState(true);

  // Hide loader faster when thumbnail is available
  useEffect(() => {
    if (thumbnail) {
      const timer = setTimeout(() => {
        setShowLoader(false);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [thumbnail]);

  const handleLoadedMetadata = useCallback(() => {
    setIsMetadataLoaded(true);
    setShowLoader(false);
    // For videos without thumbnails, consider them loaded when metadata is ready
    if (!thumbnail) {
      setIsLoaded(true);
    }
  }, [thumbnail]);

  const handleLoadedData = useCallback(() => {
    setIsLoaded(true);
    setHasError(false);
    setShowLoader(false);
  }, []);

  const handleCanPlay = useCallback(() => {
    setIsLoaded(true);
    setShowLoader(false);
  }, []);

  const handleError = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
      // Safari-specific error handling
      const isSafari = /^((?!chrome|android).)*safari/i.test(
        navigator.userAgent,
      );

      if (isSafari) {
        // Safari video error - silently handle without logging
        // Could be reported to error tracking service if needed
        logger.error('Safari video error:', e);
      }

      setHasError(true);
      setIsLoaded(false);
      setShowLoader(false);
    },
    [],
  );

  const renderOverlayContent = (): React.ReactNode => {
    const imageSizes =
      '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw';
    const imageLoading = priority ? 'eager' : 'lazy';

    if (hasError) {
      return (
        <div className="relative w-full h-full">
          <Image
            src={
              thumbnail ||
              `${EnvironmentService.assetsEndpoint}/placeholders/portrait.jpg`
            }
            alt="Video unavailable"
            fill
            sizes={imageSizes}
            className="object-cover object-center"
            priority={priority}
            loading={imageLoading}
          />
        </div>
      );
    }

    if (thumbnail) {
      return (
        <div className="relative w-full h-full">
          <Image
            src={thumbnail}
            alt="Video thumbnail"
            fill
            sizes={imageSizes}
            className="object-cover object-center"
            priority={priority}
            loading={imageLoading}
          />
          {showLoader && !isMetadataLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <Spinner size={ComponentSize.SM} className="text-white" />
            </div>
          )}
        </div>
      );
    }

    if (showLoader) {
      return (
        <div className="absolute inset-0 flex items-center justify-center bg-card">
          <Spinner />
        </div>
      );
    }

    return null;
  };

  return (
    <div className={`relative w-full h-full ${className}`}>
      {/* Show thumbnail or loading state when video isn't ready */}
      {((showLoader && !isLoaded) || hasError) && (
        <div className="absolute inset-0 z-10">{renderOverlayContent()}</div>
      )}

      <video
        controls={config?.controls}
        muted={config?.muted}
        loop={config?.loop}
        playsInline={config?.playsInline}
        autoPlay={config?.autoPlay}
        preload={config?.preload}
        ref={videoRef}
        src={
          src ||
          `${EnvironmentService.assetsEndpoint}/placeholders/portrait.jpg`
        }
        onLoadedMetadata={handleLoadedMetadata}
        onLoadedData={handleLoadedData}
        onCanPlay={handleCanPlay}
        onError={handleError}
        // crossOrigin="anonymous"
        className={`w-full h-full object-contain object-center ${
          isLoaded && !hasError ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  );
}
