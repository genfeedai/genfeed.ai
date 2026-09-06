'use client';

import { ComponentSize } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn';
import type { VideoPlayerProps } from '@genfeedai/props/studio/video-player.props';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { logger } from '@genfeedai/services/core/logger.service';
import VideoPlayerControls from '@genfeedai/ui/components/display/video-player/VideoPlayerControls';
import Spinner from '@genfeedai/ui/components/feedback/spinner/Spinner';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

interface VideoOverlayContentProps {
  hasError: boolean;
  thumbnail: string;
  showLoader: boolean;
  isMetadataLoaded: boolean;
  priority: boolean;
}

function VideoOverlayContent({
  hasError,
  thumbnail,
  showLoader,
  isMetadataLoaded,
  priority,
}: VideoOverlayContentProps): React.ReactNode {
  const imageSizes = '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw';
  const imageLoading = priority ? 'eager' : 'lazy';

  if (hasError) {
    return (
      <div className="relative size-full">
        <Image
          src={
            thumbnail ||
            `${EnvironmentService.assetsEndpoint}/placeholders/portrait.jpg`
          }
          alt="Video unavailable"
          fill
          sizes={imageSizes}
          className="object-cover object-center outline-media"
          priority={priority}
          loading={imageLoading}
        />
      </div>
    );
  }

  if (thumbnail) {
    return (
      <div className="relative size-full">
        <Image
          src={thumbnail}
          alt="Video thumbnail"
          fill
          sizes={imageSizes}
          className="object-cover object-center outline-media"
          priority={priority}
          loading={imageLoading}
        />
        {showLoader && !isMetadataLoaded && (
          <div
            className={
              'absolute inset-0 flex items-center justify-center bg-black/20' /* design-system-allow-content-color -- media overlay */
            }
          >
            <Spinner
              size={ComponentSize.SM}
              className={
                'text-white' /* design-system-allow-content-color -- media overlay */
              }
            />
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
}

export default function VideoPlayer({
  ariaLabel = 'Video player',
  mediaClassName,
  mediaProps = {},
  onLoad,
  videoRef,
  src = '',
  thumbnail = '',
  priority = false,
  isActive = true,
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
  const internalVideoRef = useRef<HTMLVideoElement>(null);
  const resolvedVideoRef = videoRef ?? internalVideoRef;
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(
    mediaProps.muted ?? config.muted ?? false,
  );
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const hasControls = mediaProps.controls ?? config.controls;
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isMetadataLoaded, setIsMetadataLoaded] = useState(false);
  const [showLoader, setShowLoader] = useState(true);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setIsLoaded(false);
    setHasError(false);
    setIsMetadataLoaded(false);
    setShowLoader(Boolean(src));
  }, [src]);

  useEffect(() => {
    if (!isActive) resolvedVideoRef.current?.pause();
  }, [isActive, resolvedVideoRef]);

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

  return (
    <div className={`relative size-full ${className}`}>
      {/* Show thumbnail or loading state when video isn't ready */}
      {((!isLoaded && (showLoader || thumbnail)) || hasError) && (
        <div className="pointer-events-none absolute inset-0 z-10">
          <VideoOverlayContent
            hasError={hasError}
            thumbnail={thumbnail}
            showLoader={showLoader}
            isMetadataLoaded={isMetadataLoaded}
            priority={priority}
          />
        </div>
      )}

      <video
        {...mediaProps}
        aria-label={mediaProps['aria-label'] ?? ariaLabel}
        controls={false}
        muted={mediaProps.muted ?? config?.muted}
        loop={mediaProps.loop ?? config?.loop}
        playsInline={mediaProps.playsInline ?? config?.playsInline}
        autoPlay={mediaProps.autoPlay ?? config?.autoPlay}
        preload={mediaProps.preload ?? config?.preload}
        ref={resolvedVideoRef}
        src={
          src ||
          `${EnvironmentService.assetsEndpoint}/placeholders/portrait.jpg`
        }
        onLoadedMetadata={(event) => {
          handleLoadedMetadata();
          setDuration(
            Number.isFinite(event.currentTarget.duration)
              ? event.currentTarget.duration
              : 0,
          );
          setIsMuted(event.currentTarget.muted);
          mediaProps.onLoadedMetadata?.(event);
        }}
        onDurationChange={(event) => {
          setDuration(
            Number.isFinite(event.currentTarget.duration)
              ? event.currentTarget.duration
              : 0,
          );
          mediaProps.onDurationChange?.(event);
        }}
        onTimeUpdate={(event) => {
          if (hasControls) setCurrentTime(event.currentTarget.currentTime);
          mediaProps.onTimeUpdate?.(event);
        }}
        onPlay={(event) => {
          setIsPlaying(true);
          mediaProps.onPlay?.(event);
        }}
        onPause={(event) => {
          setIsPlaying(false);
          mediaProps.onPause?.(event);
        }}
        onEnded={(event) => {
          setIsPlaying(false);
          mediaProps.onEnded?.(event);
        }}
        onVolumeChange={(event) => {
          setIsMuted(event.currentTarget.muted);
          mediaProps.onVolumeChange?.(event);
        }}
        onLoadedData={(event) => {
          handleLoadedData();
          onLoad?.();
          mediaProps.onLoadedData?.(event);
        }}
        onCanPlay={(event) => {
          handleCanPlay();
          mediaProps.onCanPlay?.(event);
        }}
        onError={(event) => {
          handleError(event);
          mediaProps.onError?.(event);
        }}
        className={cn(
          'size-full object-contain object-center',
          mediaClassName,
          isLoaded && !hasError ? 'opacity-100' : 'opacity-0',
        )}
      />
      {hasControls && (
        <VideoPlayerControls
          videoRef={resolvedVideoRef}
          isPlaying={isPlaying}
          isMuted={isMuted}
          currentTime={currentTime}
          duration={duration}
          onPlaybackError={() => setHasError(true)}
        />
      )}
    </div>
  );
}
