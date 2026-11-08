'use client';

import { logger } from '@genfeedai/services/core/logger.service';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseVideoRecordingOptions {
  /** Stops on its own at this many seconds. */
  maxSeconds: number;
}

export type VideoRecordingError =
  | 'denied'
  | 'no-device'
  | 'unsupported'
  | 'empty'
  | 'failed';

const MIME_TYPES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];

/** Recording quality the provider trains best on: up to 1080p, 30 fps. */
const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: 'user',
  frameRate: { ideal: 30 },
  height: { ideal: 1080 },
  width: { ideal: 1920 },
};

function supportedMimeType(): string | undefined {
  return MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

function readError(error: unknown): VideoRecordingError {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return 'denied';
    if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError')
      return 'no-device';
  }
  return 'failed';
}

/**
 * Camera + microphone recording for a talking-head take. The preview stream
 * stays open between takes so the person can reframe; every track stops on
 * unmount.
 */
export function useVideoRecording({ maxSeconds }: UseVideoRecordingOptions) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [recording, setRecording] = useState<File | null>(null);
  const [error, setError] = useState<VideoRecordingError | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const releaseCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });
    streamRef.current = null;
    if (isMountedRef.current) setStream(null);
  }, []);

  useEffect(() => {
    setIsSupported(
      typeof window !== 'undefined' &&
        typeof MediaRecorder !== 'undefined' &&
        Boolean(navigator.mediaDevices?.getUserMedia),
    );
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopTimer();
      if (recorderRef.current?.state === 'recording') {
        recorderRef.current.onstop = null;
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((track) => {
        track.stop();
      });
    };
  }, [stopTimer]);

  const openCamera = useCallback(async (): Promise<boolean> => {
    if (streamRef.current) return true;
    if (typeof MediaRecorder === 'undefined') {
      setError('unsupported');
      return false;
    }
    try {
      setError(null);
      const next = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: VIDEO_CONSTRAINTS,
      });
      if (!isMountedRef.current) {
        next.getTracks().forEach((track) => {
          track.stop();
        });
        return false;
      }
      streamRef.current = next;
      setStream(next);
      return true;
    } catch (cause: unknown) {
      logger.error('useVideoRecording openCamera failed', cause);
      setError(readError(cause));
      return false;
    }
  }, []);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    if (!(await openCamera()) || !streamRef.current) return false;
    const mimeType = supportedMimeType();
    const recorder = mimeType
      ? new MediaRecorder(streamRef.current, { mimeType })
      : new MediaRecorder(streamRef.current);
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      stopTimer();
      if (!isMountedRef.current) return;
      setIsRecording(false);
      const type = (recorder.mimeType || 'video/webm').split(';')[0] ?? '';
      const blob = new Blob(chunksRef.current, { type });
      if (blob.size === 0) {
        setError('empty');
        return;
      }
      const extension = type === 'video/mp4' ? 'mp4' : 'webm';
      setRecording(
        new File([blob], `digital-twin-take.${extension}`, { type }),
      );
    };
    recorderRef.current = recorder;
    setRecording(null);
    setError(null);
    setElapsedSeconds(0);
    startedAtRef.current = Date.now();
    // One-second slices keep a long take from living in one huge buffer.
    recorder.start(1000);
    setIsRecording(true);
    timerRef.current = setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsedSeconds(seconds);
      if (seconds >= maxSeconds) stop();
    }, 250);
    return true;
  }, [maxSeconds, openCamera, stop, stopTimer]);

  const discard = useCallback(() => {
    setRecording(null);
    setElapsedSeconds(0);
  }, []);

  return {
    discard,
    elapsedSeconds,
    error,
    isRecording,
    isSupported,
    openCamera,
    recording,
    releaseCamera,
    start,
    stop,
    stream,
  };
}
