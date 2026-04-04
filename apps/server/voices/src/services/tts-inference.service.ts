import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@voices/config/config.service';
import axios from 'axios';

interface TTSInferenceHealth {
  status: string;
  model_loaded: boolean;
  gpu: string;
  uptime_seconds: number;
}

@Injectable()
export class TTSInferenceService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Check if the TTS inference container is online and model is loaded.
   */
  async getStatus(): Promise<{
    status: 'online' | 'offline';
    modelLoaded: boolean;
  }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const url = this.configService.TTS_INFERENCE_URL;

    try {
      const response = await axios.get<TTSInferenceHealth>(`${url}/health`, {
        timeout: 5000,
      });
      return {
        modelLoaded: response.data.model_loaded,
        status: 'online',
      };
    } catch {
      this.loggerService.warn(caller, {
        message: 'TTS inference is offline',
        url,
      });
      return { modelLoaded: false, status: 'offline' };
    }
  }

  /**
   * Generate speech from text. Returns audio data as Buffer.
   *
   * If referenceAudioPath + referenceText are provided, uses voice cloning.
   * Otherwise uses the default voice.
   */
  async generateSpeech(params: {
    text: string;
    referenceAudioPath?: string;
    referenceText?: string;
  }): Promise<Buffer> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const url = this.configService.TTS_INFERENCE_URL;

    this.loggerService.log(caller, {
      hasReference: Boolean(params.referenceAudioPath),
      message: 'Generating speech',
      textLength: params.text.length,
    });

    const response = await axios.post(
      `${url}/generate`,
      {
        reference_audio_path: params.referenceAudioPath,
        reference_text: params.referenceText,
        text: params.text,
      },
      {
        responseType: 'arraybuffer',
        timeout: 120000,
      },
    );

    const audioBuffer = Buffer.from(response.data);
    this.loggerService.log(caller, {
      message: 'Speech generated',
      sizeBytes: audioBuffer.length,
    });

    return audioBuffer;
  }
}
