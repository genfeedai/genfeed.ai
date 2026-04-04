import { logger } from '@services/core/logger.service';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseVideoTrimOptions {
  videoUrl: string;
  videoDuration: number;
  minDuration?: number;
  maxDuration?: number;
}

export interface VideoThumbnail {
  time: number;
  dataUrl: string;
}

export function useVideoTrim({
  // videoUrl,
  videoDuration,
  minDuration = 2,
  maxDuration = 15,
}: UseVideoTrimOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(Math.min(videoDuration, maxDuration));
  const [currentTime, setCurrentTime] = useState(0);
  const [thumbnails, setThumbnails] = useState<VideoThumbnail[]>([]);
  const [isGeneratingThumbnails, setIsGeneratingThumbnails] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculate trim duration
  const trimDuration = endTime - startTime;

  // Validate trim range
  const isValid = trimDuration >= minDuration && trimDuration <= maxDuration;

  /**
   * Generate video thumbnails for timeline preview
   */
  const generateThumbnails = useCallback(async () => {
    if (!videoRef.current || videoDuration <= 0) {
      return;
    }

    setIsGeneratingThumbnails(true);
    setError(null);

    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Could not get canvas context');
      }

      // Generate 10 thumbnails across the video duration
      const thumbnailCount = 10;
      const interval = videoDuration / thumbnailCount;
      const newThumbnails: VideoThumbnail[] = [];

      canvas.width = 160;
      canvas.height = 90;

      for (let i = 0; i < thumbnailCount; i++) {
        const time = i * interval;

        // Wait for video to seek
        await new Promise<void>((resolve, reject) => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            video.removeEventListener('error', onError);
            resolve();
          };

          const onError = () => {
            video.removeEventListener('seeked', onSeeked);
            video.removeEventListener('error', onError);
            reject(new Error('Error seeking video'));
          };

          video.addEventListener('seeked', onSeeked);
          video.addEventListener('error', onError);
          video.currentTime = time;

          // Timeout after 2 seconds
          setTimeout(() => {
            video.removeEventListener('seeked', onSeeked);
            video.removeEventListener('error', onError);
            reject(new Error('Seek timeout'));
          }, 2000);
        });

        // Draw frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Convert to data URL
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);

        newThumbnails.push({ dataUrl, time });
      }

      setThumbnails(newThumbnails);
    } catch (err) {
      logger.error('Error generating thumbnails', err);
      setError('Failed to generate thumbnails');
    } finally {
      setIsGeneratingThumbnails(false);
    }
  }, [videoDuration]);

  /**
   * Update start and end times from slider
   */
  const handleRangeChange = useCallback(
    (values: [number, number]) => {
      const [newStart, newEnd] = values;

      // Ensure minimum duration
      if (newEnd - newStart < minDuration) {
        return;
      }

      // Ensure maximum duration
      if (newEnd - newStart > maxDuration) {
        return;
      }

      setStartTime(newStart);
      setEndTime(newEnd);
    },
    [minDuration, maxDuration],
  );

  /**
   * Seek video to specific time
   */
  const seekTo = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  /**
   * Play trimmed portion of video
   */
  const trimRafRef = useRef<number>(0);
  const playTrimmedPortion = useCallback(() => {
    if (!videoRef.current) {
      return;
    }

    cancelAnimationFrame(trimRafRef.current);
    videoRef.current.currentTime = startTime;
    videoRef.current.play();

    // Stop playing at end time
    const checkTime = () => {
      if (!videoRef.current) {
        return;
      }

      if (videoRef.current.currentTime >= endTime) {
        videoRef.current.pause();
        videoRef.current.currentTime = startTime;
      } else {
        trimRafRef.current = requestAnimationFrame(checkTime);
      }
    };

    trimRafRef.current = requestAnimationFrame(checkTime);
  }, [startTime, endTime]);

  /**
   * Update current time as video plays
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, []);

  /**
   * Generate thumbnails when video loads
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const handleLoadedMetadata = () => {
      generateThumbnails();
    };

    if (video.readyState >= 2) {
      // HAVE_CURRENT_DATA
      generateThumbnails();
    } else {
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
    }

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [generateThumbnails]);

  // Cleanup trim rAF on unmount
  useEffect(() => {
    return () => cancelAnimationFrame(trimRafRef.current);
  }, []);

  return {
    canvasRef,
    currentTime,
    endTime,
    error,
    handleRangeChange,
    isGeneratingThumbnails,
    isValid,
    playTrimmedPortion,
    seekTo,
    setEndTime,
    setStartTime,
    startTime,
    thumbnails,
    trimDuration,
    videoRef,
  };
}
