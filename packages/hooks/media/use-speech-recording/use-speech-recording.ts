import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  SpeechService,
  type SpeechTranscriptionResult,
} from '@services/ai/speech.service';
import { logger } from '@services/core/logger.service';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseSpeechRecordingOptions {
  onTranscription?: (result: SpeechTranscriptionResult) => void;
  onError?: (error: string) => void;
  language?: string;
  prompt?: string;
}

/**
 * Backend-based speech recording hook
 * Records audio in browser and sends to backend for Whisper transcription
 * Works with all browsers including Brave with shields enabled
 */
export function useSpeechRecording({
  onTranscription,
  onError,
  language = 'auto',
  prompt,
}: UseSpeechRecordingOptions = {}) {
  const getSpeechService = useAuthedService((token: string) =>
    SpeechService.getInstance(token),
  );
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkSupport = () => {
      if (typeof window === 'undefined') {
        return setIsSupported(false);
      }

      const hasMediaRecorder = typeof MediaRecorder !== 'undefined';
      const hasGetUserMedia = !!navigator.mediaDevices?.getUserMedia;
      const supported = hasMediaRecorder && hasGetUserMedia;
      setIsSupported(supported);

      if (!supported) {
        logger.warn('Speech recording not supported in this browser');
      } else {
        logger.info('Speech recording is supported');
      }
    };

    checkSupport();
  }, []);

  const startRecording = async (): Promise<boolean> => {
    const url = 'useSpeechRecording startRecording';

    try {
      setError(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        await processRecording();
      };

      mediaRecorder.start();
      setIsRecording(true);

      logger.info(`${url} recording started`);
      return true;
    } catch (error: any) {
      logger.error(`${url} failed`, error);

      let errorMessage = 'Failed to start recording';

      if (error.name === 'NotAllowedError') {
        errorMessage =
          'Microphone access denied. Please allow microphone access.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'No microphone found. Please connect a microphone.';
      } else if (error.name === 'NotSupportedError') {
        errorMessage = 'Audio recording not supported in this browser.';
      }

      setError(errorMessage);
      onError?.(errorMessage);
      return false;
    }
  };

  const stopRecording = (): void => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      logger.info('useSpeechRecording stopRecording');
    }
  };

  const processRecording = async (): Promise<void> => {
    const url = 'useSpeechRecording processRecording';

    try {
      setIsProcessing(true);

      const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });

      if (!SpeechService.isFileSizeValid(audioBlob as unknown as File)) {
        throw new Error('Recording too long. Maximum 25MB allowed.');
      }

      logger.info(`${url} processing audio`, {
        blobSize: audioBlob.size,
        blobType: audioBlob.type,
      });

      const audioFile = new File([audioBlob], 'recording.webm', {
        type: audioBlob.type,
      });

      const speechService = await getSpeechService();
      const result = await speechService.transcribeAudio(audioFile, {
        language,
        prompt,
      });

      logger.info(`${url} transcription completed`, {
        creditsUsed: result.creditsUsed,
        duration: result.duration,
        language: result.language,
        textLength: result.text.length,
      });

      onTranscription?.(result);
      setError(null);
    } catch (error: any) {
      logger.error(`${url} failed`, error);

      const errorMessage = error.message || 'Transcription failed';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setIsProcessing(false);

      // Clean up
      cleanup();
    }
  };

  const cleanup = useCallback((): void => {
    // Stop all tracks in the stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      streamRef.current = null;
    }

    // Clear media recorder
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const toggle = (): void => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    error,
    isProcessing,
    isRecording,
    isSupported,
    startRecording,
    stopRecording,
    toggle,
  };
}
