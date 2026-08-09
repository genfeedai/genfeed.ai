import { axiosResponse, installMockHttp } from '@services/__mocks__/http.mock';
import { SpeechService } from '@services/ai/speech.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const transcription = {
  creditsUsed: 2,
  duration: 12,
  language: 'en',
  text: 'hello world',
};

function axiosError(status: number, detail?: string): Record<string, unknown> {
  return {
    isAxiosError: true,
    response: { data: detail ? { detail } : {}, status },
  };
}

describe('SpeechService', () => {
  const token = 'speech-token';

  beforeEach(() => {
    SpeechService.clearInstance();
    vi.clearAllMocks();
  });

  it('getInstance caches per token and clearInstance resets', () => {
    const first = SpeechService.getInstance(token);
    expect(SpeechService.getInstance(token)).toBe(first);
    SpeechService.clearInstance();
    expect(SpeechService.getInstance(token)).not.toBe(first);
  });

  describe('transcribeAudio', () => {
    it('POSTs multipart form data with optional fields', async () => {
      const service = SpeechService.getInstance(token);
      const http = installMockHttp(service);
      http.post.mockResolvedValue(axiosResponse(transcription));

      const file = new File(['audio-bytes'], 'clip.mp3', {
        type: 'audio/mpeg',
      });
      const result = await service.transcribeAudio(file, {
        language: 'en',
        prompt: 'podcast',
      });

      expect(http.post).toHaveBeenCalledWith(
        'transcribe/audio',
        expect.any(FormData),
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      const formData = http.post.mock.calls[0][1] as FormData;
      expect(formData.get('audio')).toBeInstanceOf(File);
      expect(formData.get('language')).toBe('en');
      expect(formData.get('prompt')).toBe('podcast');
      expect(result).toEqual(transcription);
    });

    it('omits optional fields when not provided', async () => {
      const service = SpeechService.getInstance(token);
      const http = installMockHttp(service);
      http.post.mockResolvedValue(axiosResponse(transcription));

      const file = new File(['audio'], 'clip.wav', { type: 'audio/wav' });
      await service.transcribeAudio(file);

      const formData = http.post.mock.calls[0][1] as FormData;
      expect(formData.get('language')).toBeNull();
      expect(formData.get('prompt')).toBeNull();
    });

    it('maps 402 to an insufficient-credits error', async () => {
      const service = SpeechService.getInstance(token);
      const http = installMockHttp(service);
      http.post.mockRejectedValue(axiosError(402));

      const file = new File(['audio'], 'clip.mp3', { type: 'audio/mpeg' });
      await expect(service.transcribeAudio(file)).rejects.toThrow(
        'Insufficient credits for transcription',
      );
    });

    it('maps 400 to an invalid-format error', async () => {
      const service = SpeechService.getInstance(token);
      const http = installMockHttp(service);
      http.post.mockRejectedValue(axiosError(400));

      const file = new File(['audio'], 'clip.mp3', { type: 'audio/mpeg' });
      await expect(service.transcribeAudio(file)).rejects.toThrow(
        'Invalid audio file format',
      );
    });

    it('surfaces the backend detail message when present', async () => {
      const service = SpeechService.getInstance(token);
      const http = installMockHttp(service);
      http.post.mockRejectedValue(axiosError(500, 'Whisper unavailable'));

      const file = new File(['audio'], 'clip.mp3', { type: 'audio/mpeg' });
      await expect(service.transcribeAudio(file)).rejects.toThrow(
        'Whisper unavailable',
      );
    });

    it('falls back to a generic transcription error', async () => {
      const service = SpeechService.getInstance(token);
      const http = installMockHttp(service);
      http.post.mockRejectedValue(new Error('socket hangup'));

      const file = new File(['audio'], 'clip.mp3', { type: 'audio/mpeg' });
      await expect(service.transcribeAudio(file)).rejects.toThrow(
        'Speech transcription failed',
      );
    });
  });

  describe('transcribeFromUrl', () => {
    it('POSTs the url payload with options', async () => {
      const service = SpeechService.getInstance(token);
      const http = installMockHttp(service);
      http.post.mockResolvedValue(axiosResponse(transcription));

      const result = await service.transcribeFromUrl(
        'https://cdn.example.com/audio.mp3',
        { language: 'de' },
      );

      expect(http.post).toHaveBeenCalledWith('transcribe/url', {
        language: 'de',
        prompt: undefined,
        url: 'https://cdn.example.com/audio.mp3',
      });
      expect(result).toEqual(transcription);
    });

    it('maps errors through the shared transcription error mapper', async () => {
      const service = SpeechService.getInstance(token);
      const http = installMockHttp(service);
      http.post.mockRejectedValue(axiosError(402));

      await expect(
        service.transcribeFromUrl('https://cdn.example.com/audio.mp3'),
      ).rejects.toThrow('Insufficient credits for transcription');
    });
  });

  describe('static format helpers', () => {
    it('accepts supported MIME types', () => {
      const file = new File([''], 'a.bin', { type: 'audio/wav' });
      expect(SpeechService.isAudioFormatSupported(file)).toBe(true);
    });

    it('falls back to the file extension', () => {
      const file = new File([''], 'clip.FLAC', { type: '' });
      expect(SpeechService.isAudioFormatSupported(file)).toBe(true);
    });

    it('rejects unsupported formats', () => {
      const file = new File([''], 'document.txt', { type: 'text/plain' });
      expect(SpeechService.isAudioFormatSupported(file)).toBe(false);
    });

    it('exposes the supported format labels', () => {
      expect(SpeechService.getSupportedFormats()).toContain('MP3 (.mp3)');
    });

    it('validates file size against the 25MB cap', () => {
      expect(SpeechService.getMaxFileSize()).toBe(25 * 1024 * 1024);
      const small = new Blob(['tiny']);
      expect(SpeechService.isFileSizeValid(small)).toBe(true);
    });
  });
});
