import {
  getErrorStatus,
  isAxiosError,
} from '@genfeedai/utils/error/error-handler.util';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import { logger } from '@services/core/logger.service';

export interface SpeechTranscriptionOptions {
  language?: string;
  prompt?: string;
}

export interface SpeechTranscriptionResult {
  text: string;
  language: string;
  duration: number;
  confidence?: number;
  creditsUsed: number;
}

function getErrorDetail(error: unknown): string | undefined {
  if (!isAxiosError(error)) {
    return undefined;
  }
  return error.response?.data?.detail;
}

function mapTranscriptionError(error: unknown): Error {
  const status = getErrorStatus(error);
  if (status === 402) {
    return new Error('Insufficient credits for transcription');
  }
  if (status === 400) {
    return new Error('Invalid audio file format');
  }
  const detail = getErrorDetail(error);
  if (detail) {
    return new Error(detail);
  }
  return new Error('Speech transcription failed');
}

/**
 * Speech Service
 * Handles speech-to-text transcription using backend OpenAI Whisper API
 * Works with all browsers (including Brave with shields enabled)
 */
export class SpeechService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/speech`, token);
  }

  static getInstance(token: string): SpeechService {
    return HTTPBaseService.getBaseServiceInstance(
      SpeechService,
      token,
    ) as SpeechService;
  }

  static clearInstance(): void {
    HTTPBaseService.clearInstance.call(SpeechService);
  }
  /**
   * Transcribe audio file using backend Whisper API
   * @param audioFile - Audio file to transcribe
   * @param options - Transcription options
   * @returns Promise with transcription result
   */
  async transcribeAudio(
    audioFile: File,
    options: SpeechTranscriptionOptions = {},
  ): Promise<SpeechTranscriptionResult> {
    const url = 'SpeechService transcribeAudio';
    logger.info(`${url} started`, {
      fileName: audioFile.name,
      fileSize: audioFile.size,
      fileType: audioFile.type,
      options,
    });

    try {
      // Create FormData for file upload
      const formData = new FormData();
      formData.append('audio', audioFile);

      if (options.language) {
        formData.append('language', options.language);
      }

      if (options.prompt) {
        formData.append('prompt', options.prompt);
      }

      // Call backend speech transcription endpoint
      return await this.instance
        .post('transcribe/audio', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        })
        .then((res) => res.data)
        .then((data) => {
          logger.info(`${url} completed`, {
            creditsUsed: data.creditsUsed,
            duration: data.duration,
            language: data.language,
            textLength: data.text.length,
          });
          return data;
        });
    } catch (error: unknown) {
      logger.error(`${url} failed`, error);
      throw mapTranscriptionError(error);
    }
  }

  /**
   * Transcribe audio from URL using backend Whisper API
   * @param audioUrl - URL of audio file to transcribe
   * @param options - Transcription options
   * @returns Promise with transcription result
   */
  async transcribeFromUrl(
    audioUrl: string,
    options: SpeechTranscriptionOptions = {},
  ): Promise<SpeechTranscriptionResult> {
    const url = 'SpeechService transcribeFromUrl';
    logger.info(`${url} started`, {
      audioUrl,
      options,
    });

    try {
      return await this.instance
        .post('transcribe/url', {
          language: options.language,
          prompt: options.prompt,
          url: audioUrl,
        })
        .then((res) => res.data)
        .then((data) => {
          logger.info(`${url} completed`, {
            creditsUsed: data.creditsUsed,
            duration: data.duration,
            language: data.language,
            textLength: data.text.length,
          });
          return data;
        });
    } catch (error: unknown) {
      logger.error(`${url} failed`, error);
      throw mapTranscriptionError(error);
    }
  }

  /**
   * Check if audio file format is supported
   * @param file - Audio file to check
   * @returns boolean indicating if format is supported
   */
  static isAudioFormatSupported(file: File): boolean {
    const supportedTypes = [
      'audio/mpeg',
      'audio/wav',
      'audio/mp4',
      'audio/webm',
      'audio/ogg',
      'audio/flac',
    ];

    const supportedExtensions = [
      '.mp3',
      '.wav',
      '.mp4',
      '.m4a',
      '.webm',
      '.ogg',
      '.flac',
    ];

    // Check MIME type
    if (supportedTypes.includes(file.type)) {
      return true;
    }

    // Check file extension as fallback
    const extension = file.name.toLowerCase().split('.').pop() || '';
    return supportedExtensions.some((ext) => ext.includes(extension));
  }

  /**
   * Get supported audio formats for display
   * @returns Array of supported format descriptions
   */
  static getSupportedFormats(): string[] {
    return [
      'MP3 (.mp3)',
      'WAV (.wav)',
      'MP4 Audio (.mp4, .m4a)',
      'WebM Audio (.webm)',
      'OGG (.ogg)',
      'FLAC (.flac)',
    ];
  }

  /**
   * Get maximum file size for transcription (25MB)
   * @returns Maximum file size in bytes
   */
  static getMaxFileSize(): number {
    return 25 * 1024 * 1024; // 25MB
  }

  /**
   * Check if file size is within limits
   * @param file - File to check
   * @returns boolean indicating if file size is acceptable
   */
  static isFileSizeValid(file: File): boolean {
    return file.size <= SpeechService.getMaxFileSize();
  }
}
