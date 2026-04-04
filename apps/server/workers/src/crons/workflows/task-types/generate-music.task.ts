import {
  Music,
  type MusicDocument,
} from '@api/collections/musics/schemas/music.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { ByokService } from '@api/services/byok/byok.service';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/elevenlabs.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { ByokProvider, MusicTaskModel } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

export interface GenerateMusicConfig {
  model: MusicTaskModel;
  prompt: string;
  duration?: number; // seconds
  genre?: string;
  mood?: string;
  tempo?: 'slow' | 'medium' | 'fast';
  instruments?: string[];
  key?: string; // Musical key (C, D, E, etc.)
  bpm?: number; // Beats per minute
  style?: string;
}

export interface GenerateMusicResult {
  success: boolean;
  musicId?: string;
  error?: string;
  metadata?: {
    model: string;
    prompt: string;
    duration?: number;
    generationTime?: number;
  };
}

/**
 * Task handler for generating AI music
 * Supports multiple AI music generation models
 */
@Injectable()
export class GenerateMusicTask {
  constructor(
    @InjectModel(Music.name, DB_CONNECTIONS.CLOUD)
    private readonly musicModel: Model<MusicDocument>,
    private readonly replicateService: ReplicateService,
    private readonly elevenlabsService: ElevenLabsService,
    private readonly byokService: ByokService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Execute music generation task
   */
  async execute(
    config: GenerateMusicConfig,
    userId: string,
    organizationId: string,
  ): Promise<GenerateMusicResult> {
    const startTime = Date.now();

    try {
      this.logger.log(
        `Executing generate:music task with model: ${config.model}`,
        'GenerateMusicTask',
      );

      let generatedUrl: string;
      let externalId: string;

      // Route to appropriate AI service based on model
      switch (config.model) {
        case MusicTaskModel.MUSICGEN:
          externalId = await this.generateWithMusicGen(config, organizationId);
          generatedUrl = externalId;
          break;

        case MusicTaskModel.RIFFUSION:
          externalId = await this.generateWithRiffusion(config, organizationId);
          generatedUrl = externalId;
          break;

        case MusicTaskModel.ELEVENLABS:
          externalId = await this.generateWithElevenLabs(
            config,
            organizationId,
            userId,
          );
          generatedUrl = externalId;
          break;

        case MusicTaskModel.REPLICATE:
          externalId = await this.generateWithReplicate(config, organizationId);
          generatedUrl = externalId;
          break;

        default:
          throw new Error(`Unsupported model: ${config.model}`);
      }

      // Save generated music to database
      const music = new this.musicModel({
        duration: config.duration || 30,
        genre: config.genre,
        isDeleted: false,
        metadata: {
          bpm: config.bpm,
          generatedBy: 'workflow',
          instruments: config.instruments,
          key: config.key,
          model: config.model,
          prompt: config.prompt,
          style: config.style,
        },
        model: config.model,
        mood: config.mood,
        organization: new Types.ObjectId(organizationId),
        prompt: config.prompt,
        tempo: config.tempo,
        title: this.generateTitle(config),
        url: generatedUrl,
        user: new Types.ObjectId(userId),
      });

      await music.save();

      const generationTime = Date.now() - startTime;

      this.logger.log(
        `Music generated successfully: ${music._id} in ${generationTime}ms`,
        'GenerateMusicTask',
      );

      return {
        metadata: {
          duration: config.duration,
          generationTime,
          model: config.model,
          prompt: config.prompt,
        },
        musicId: (music._id as Types.ObjectId).toString(),
        success: true,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to generate music', error, 'GenerateMusicTask');

      return {
        error: (error as Error).message || 'Music generation failed',
        metadata: {
          model: config.model,
          prompt: config.prompt,
        },
        success: false,
      };
    }
  }

  /**
   * Generate music using MusicGen
   */
  private async generateWithMusicGen(
    config: GenerateMusicConfig,
    organizationId: string,
  ): Promise<string> {
    const byokKey = await this.byokService.resolveApiKey(
      organizationId,
      ByokProvider.REPLICATE,
    );

    const result = await this.replicateService.runModel(
      'meta/musicgen:latest',
      {
        duration: config.duration || 30,
        prompt: config.prompt,
        temperature: 1.0,
        top_k: 250,
        top_p: 0.0,
      },
      byokKey?.apiKey,
    );

    return result;
  }

  /**
   * Generate music using Riffusion
   */
  private async generateWithRiffusion(
    config: GenerateMusicConfig,
    organizationId: string,
  ): Promise<string> {
    const byokKey = await this.byokService.resolveApiKey(
      organizationId,
      ByokProvider.REPLICATE,
    );

    const promptText = this.buildRiffusionPrompt(config);

    const result = await this.replicateService.runModel(
      'riffusion/riffusion:latest',
      {
        alpha: 0.5,
        denoising: 0.75,
        num_inference_steps: 50,
        prompt_a: promptText,
        seed_image_id: 'vibes',
      },
      byokKey?.apiKey,
    );

    return result;
  }

  /**
   * Generate music using ElevenLabs (for voice/audio)
   */
  private async generateWithElevenLabs(
    config: GenerateMusicConfig,
    organizationId: string,
    userId: string,
  ): Promise<string> {
    const byokKey = await this.byokService.resolveApiKey(
      organizationId,
      ByokProvider.ELEVENLABS,
    );

    // ElevenLabs is primarily for voice, but can generate audio effects
    // This might be used for voiceovers or sound effects in music
    const result = await this.elevenlabsService.textToSpeech(
      'default',
      config.prompt,
      organizationId,
      userId,
      byokKey?.apiKey,
    );

    return result as unknown as string;
  }

  /**
   * Generate music using generic Replicate model
   */
  private async generateWithReplicate(
    config: GenerateMusicConfig,
    organizationId: string,
  ): Promise<string> {
    const byokKey = await this.byokService.resolveApiKey(
      organizationId,
      ByokProvider.REPLICATE,
    );

    const result = await this.replicateService.runModel(
      'meta/musicgen:latest',
      {
        duration: config.duration || 30,
        prompt: config.prompt,
      },
      byokKey?.apiKey,
    );

    return result;
  }

  /**
   * Build a detailed prompt for Riffusion
   */
  private buildRiffusionPrompt(config: GenerateMusicConfig): string {
    const parts: string[] = [config.prompt];

    if (config.genre) {
      parts.push(`${config.genre} genre`);
    }

    if (config.mood) {
      parts.push(`${config.mood} mood`);
    }

    if (config.tempo) {
      parts.push(`${config.tempo} tempo`);
    }

    if (config.instruments && config.instruments.length > 0) {
      parts.push(`with ${config.instruments.join(', ')}`);
    }

    if (config.bpm) {
      parts.push(`${config.bpm} BPM`);
    }

    if (config.key) {
      parts.push(`in key of ${config.key}`);
    }

    return parts.join(', ');
  }

  /**
   * Generate a title for the music based on config
   */
  private generateTitle(config: GenerateMusicConfig): string {
    const parts: string[] = [];

    if (config.genre) {
      parts.push(config.genre);
    }

    if (config.mood) {
      parts.push(config.mood);
    }

    parts.push('Music');

    if (config.duration) {
      parts.push(`(${config.duration}s)`);
    }

    return parts.join(' ');
  }

  /**
   * Validate configuration before execution
   */
  validateConfig(config: GenerateMusicConfig): {
    valid: boolean;
    error?: string;
  } {
    if (!config.prompt || config.prompt.trim().length === 0) {
      return { error: 'Prompt is required', valid: false };
    }

    if (config.prompt.length > 1000) {
      return {
        error: 'Prompt is too long (max 1000 characters)',
        valid: false,
      };
    }

    const validModels = Object.values(MusicTaskModel);
    if (!validModels.includes(config.model)) {
      return {
        error: `Invalid model. Must be one of: ${validModels.join(', ')}`,
        valid: false,
      };
    }

    if (config.duration && (config.duration < 5 || config.duration > 300)) {
      return {
        error: 'Duration must be between 5 and 300 seconds',
        valid: false,
      };
    }

    if (config.bpm && (config.bpm < 40 || config.bpm > 240)) {
      return { error: 'BPM must be between 40 and 240', valid: false };
    }

    const validTempos = ['slow', 'medium', 'fast'];
    if (config.tempo && !validTempos.includes(config.tempo)) {
      return {
        error: `Invalid tempo. Must be one of: ${validTempos.join(', ')}`,
        valid: false,
      };
    }

    return { valid: true };
  }

  /**
   * Estimate generation time based on config
   */
  estimateGenerationTime(config: GenerateMusicConfig): number {
    // Base time in seconds
    let estimatedTime = 30;

    // Add time based on duration
    if (config.duration) {
      estimatedTime += config.duration * 2; // ~2 seconds per second of music
    }

    // Riffusion typically takes longer
    if (config.model === 'riffusion') {
      estimatedTime *= 1.5;
    }

    return estimatedTime;
  }
}
