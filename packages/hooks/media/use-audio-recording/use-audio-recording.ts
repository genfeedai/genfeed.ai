'use client';

import { logger } from '@services/core/logger.service';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseAudioRecordingOptions {
  onError?: (error: string) => void;
  preferredMimeType?: string;
}

const DEFAULT_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
];

export function useAudioRecording({
  onError,
  preferredMimeType,
}: UseAudioRecordingOptions = {}) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [recordedFile, setRecordedFile] = useState<File | null>(null);

  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }, []);

  useEffect(() => {
    const supported =
      typeof window !== 'undefined' &&
      typeof MediaRecorder !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia;

    setIsSupported(supported);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const startRecording = useCallback(async (): Promise<boolean> => {
    try {
      setError(null);
      setRecordedFile(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      streamRef.current = stream;

      const mimeType =
        [preferredMimeType, ...DEFAULT_MIME_TYPES]
          .filter((type): type is string => Boolean(type))
          .find((type) => MediaRecorder.isTypeSupported(type)) ?? undefined;

      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: mediaRecorder.mimeType || 'audio/webm',
        });

        if (blob.size === 0) {
          const message = 'Recording failed. Please try again.';
          setError(message);
          onError?.(message);
          cleanup();
          return;
        }

        const extension = blob.type.includes('mp4') ? 'm4a' : 'webm';
        const file = new File([blob], `voice-sample.${extension}`, {
          type: blob.type,
        });
        setRecordedFile(file);
        cleanup();
      };

      mediaRecorder.start();
      setIsRecording(true);
      return true;
    } catch (err: unknown) {
      logger.error('useAudioRecording startRecording failed', err);

      let message = 'Failed to start recording.';
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          message = 'Microphone access denied. Please allow microphone access.';
        } else if (err.name === 'NotFoundError') {
          message = 'No microphone found. Please connect a microphone.';
        }
      }

      setError(message);
      onError?.(message);
      cleanup();
      return false;
    }
  }, [cleanup, onError, preferredMimeType]);

  return {
    clearRecordedFile: () => setRecordedFile(null),
    error,
    isRecording,
    isSupported,
    recordedFile,
    startRecording,
    stopRecording,
  };
}
