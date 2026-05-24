import fs from 'node:fs';
import { ConfigService } from '@api/config/config.service';
import { ApiKeyHelperService } from '@api/services/api-key/api-key-helper.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { ApiKeyCategory, FileInputType } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

type ElevenLabsVoice = {
  name?: string | null;
  previewUrl?: string | null;
  voiceId: string;
};

type ElevenLabsAudioWithTimestampsResponse = {
  alignment?: {
    characterEndTimesSeconds?: number[];
  } | null;
  audioBase64: string;
  normalizedAlignment?: {
    characterEndTimesSeconds?: number[];
  } | null;
};

type ForcedAlignmentWord = {
  end: number;
  start: number;
  text: string;
};

@Injectable()
export class ElevenLabsService {
  private readonly constructorName: string = String(this.constructor.name);
  private client: ElevenLabsClient | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly apiKeyHelperService: ApiKeyHelperService,
    private readonly filesClientService: FilesClientService,
  ) {}

  private getClient(apiKeyOverride?: string): ElevenLabsClient {
    if (apiKeyOverride) {
      return new ElevenLabsClient({ apiKey: apiKeyOverride });
    }
    if (!this.client) {
      const apiKey = this.apiKeyHelperService.getApiKey(
        ApiKeyCategory.ELEVENLABS,
      );
      this.client = new ElevenLabsClient({ apiKey });
    }
    return this.client;
  }

  public async getVoices(
    _organizationId?: string,
    _userId?: string,
    apiKeyOverride?: string,
  ): Promise<Array<{ voiceId: string; name: string; preview?: string }>> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} started`);

      const client = this.getClient(apiKeyOverride);
      const voices = await client.voices.getAll();

      return voices.voices.map((voice: ElevenLabsVoice) => ({
        name: voice.name ?? 'Untitled Voice',
        preview: voice.previewUrl ?? undefined,
        voiceId: voice.voiceId,
      }));
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async textToSpeech(
    voiceId: string,
    text: string,
    _organizationId?: string,
    _userId?: string,
    apiKeyOverride?: string,
  ): Promise<ElevenLabsAudioWithTimestampsResponse> {
    const client = this.getClient(apiKeyOverride);
    return (await client.textToSpeech.convertWithTimestamps(voiceId, {
      modelId: this.configService.get('ELEVENLABS_MODEL'),
      outputFormat: 'mp3_44100_128',
      text,
    })) as ElevenLabsAudioWithTimestampsResponse;
  }

  /**
   * Generate audio with ElevenLabs TTS and upload to CDN
   * Returns the CDN URL and duration of the generated audio
   */
  public async generateAndUploadAudio(
    voiceId: string,
    text: string,
    ingredientId: string,
    _organizationId?: string,
    _userId?: string,
    apiKeyOverride?: string,
  ): Promise<{
    audioUrl: string;
    duration: number;
    uploadResult: Record<string, unknown>;
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} started`, {
        textLength: text.length,
        voiceId,
      });

      // Generate audio with ElevenLabs
      const client = this.getClient(apiKeyOverride);
      const audioResponse = (await client.textToSpeech.convertWithTimestamps(
        voiceId,
        {
          modelId: this.configService.get('ELEVENLABS_MODEL'),
          outputFormat: 'mp3_44100_128',
          text,
        },
      )) as ElevenLabsAudioWithTimestampsResponse;

      const audioBuffer = Buffer.from(audioResponse.audioBase64, 'base64');

      // Calculate duration from alignment timestamps when available.
      let duration = 0;
      const alignment =
        audioResponse.normalizedAlignment ?? audioResponse.alignment;
      const characterEndTimes = alignment?.characterEndTimesSeconds;
      if (characterEndTimes && characterEndTimes.length > 0) {
        duration = characterEndTimes[characterEndTimes.length - 1] ?? 0;
      }

      // Upload to S3/CDN
      const uploadResult = await this.filesClientService.uploadToS3(
        ingredientId,
        'musics',
        {
          contentType: 'audio/mpeg',
          data: audioBuffer,
          type: FileInputType.BUFFER,
        },
      );

      // Use duration from upload result if available, otherwise use calculated duration
      const finalDuration = uploadResult.duration || duration;

      const audioUrl = uploadResult.publicUrl;
      if (!audioUrl) {
        throw new Error('Failed to get public URL after upload');
      }

      this.loggerService.log(`${url} completed`, {
        audioUrl,
        duration: finalDuration,
      });

      return {
        audioUrl,
        duration: finalDuration,
        uploadResult: uploadResult as Record<string, unknown>,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async cloneVoice(
    name: string,
    files: Buffer[],
    options?: { description?: string; removeBackgroundNoise?: boolean },
    apiKeyOverride?: string,
  ): Promise<{ voiceId: string; name: string }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} started`, { name });

      const client = this.getClient(apiKeyOverride);
      const response = await client.voices.ivc.create({
        files: files.map((file, index) => ({
          contentLength: file.length,
          contentType: 'audio/mpeg',
          data: file,
          filename: `voice-sample-${index + 1}.mp3`,
        })),
        name,
        ...(options?.description && { description: options.description }),
        ...(options?.removeBackgroundNoise !== undefined && {
          removeBackgroundNoise: options.removeBackgroundNoise,
        }),
      });

      this.loggerService.log(`${url} completed`, {
        name,
        voiceId: response.voiceId,
      });

      return {
        name,
        voiceId: response.voiceId,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async deleteVoice(
    voiceId: string,
    apiKeyOverride?: string,
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} started`, { voiceId });

      const client = this.getClient(apiKeyOverride);
      await client.voices.delete(voiceId);

      this.loggerService.log(`${url} completed`, { voiceId });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  private toSrtTimestamp(seconds: number): string {
    const date = new Date(Math.floor(seconds * 1000));
    const milliseconds = Math.floor((seconds % 1) * 1000)
      .toString()
      .padStart(3, '0');
    return `${date.toISOString().substring(11, 19)},${milliseconds}`;
  }

  private convertToSrt(words: ForcedAlignmentWord[]): string {
    const lines = words.map((word, index: number) => {
      const start = this.toSrtTimestamp(word.start);
      const end = this.toSrtTimestamp(word.end);
      return `${index + 1}\n${start} --> ${end}\n${word.text}\n`;
    });

    return lines.join('\n');
  }

  public async forcedAlignment(
    filePath: string,
    text: string,
    _organizationId?: string,
    _userId?: string,
    apiKeyOverride?: string,
  ): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      this.loggerService.log(`${url} started`);
      const client = this.getClient(apiKeyOverride);
      const response = await client.forcedAlignment.create({
        file: fs.createReadStream(filePath),
        text,
      });

      const srtContent = this.convertToSrt(
        response.words as ForcedAlignmentWord[],
      );
      this.loggerService.log(`${url} completed`);
      return srtContent;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }
}
