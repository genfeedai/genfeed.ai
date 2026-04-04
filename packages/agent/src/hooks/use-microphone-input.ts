import { useCallback, useEffect, useRef, useState } from 'react';

interface UseMicrophoneInputOptions {
  apiBaseUrl: string;
  getToken: () => Promise<string | null>;
  onTranscript: (text: string) => void;
  onError?: (error: string) => void;
}

interface UseMicrophoneInputReturn {
  isListening: boolean;
  isSupported: boolean;
  isTranscribing: boolean;
  startListening: () => void;
  stopListening: () => void;
}

export function useMicrophoneInput({
  apiBaseUrl,
  getToken,
  onTranscript,
  onError,
}: UseMicrophoneInputOptions): UseMicrophoneInputReturn {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported(!!navigator.mediaDevices?.getUserMedia);
  }, []);

  const stopListening = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      mediaRecorderRef.current.stop();
    }
    setIsListening(false);
  }, []);

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });

        setIsTranscribing(true);
        try {
          const token = await getToken();
          const formData = new FormData();
          formData.append('audio', blob, 'recording.webm');

          const response = await fetch(
            `${apiBaseUrl}/speech/transcribe/audio`,
            {
              body: formData,
              headers: token ? { Authorization: `Bearer ${token}` } : {},
              method: 'POST',
            },
          );

          if (!response.ok)
            throw new Error(`Transcription failed: ${response.status}`);

          const data = await response.json();
          // Response is JSON:API serialized — extract transcript text
          const text =
            data?.data?.attributes?.text ??
            data?.data?.text ??
            data?.text ??
            '';
          if (text) {
            onTranscript(text);
          }
        } catch (err) {
          onError?.((err as Error).message ?? 'Transcription failed');
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorder.start();
      setIsListening(true);
    } catch (_err) {
      onError?.('Microphone access denied');
    }
  }, [apiBaseUrl, getToken, onTranscript, onError]);

  return {
    isListening,
    isSupported,
    isTranscribing,
    startListening,
    stopListening,
  };
}
