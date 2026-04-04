import Joi from 'joi';

/**
 * FFmpeg config for Files service
 */
export const ffmpegSchema = {
  FFMPEG_AUDIO_CODEC: Joi.string().optional(),
  FFMPEG_CRF: Joi.string().optional(),
  FFMPEG_MAX_PROCESSES: Joi.string().optional(),
  FFMPEG_PATH: Joi.string().optional(),
  FFMPEG_PIXEL_FORMAT: Joi.string().optional(),
  FFMPEG_PRESET: Joi.string().optional(),
  FFMPEG_TEMP_DIR: Joi.string().optional(),
  FFMPEG_THREADS: Joi.number().default(2),
  FFMPEG_TIMEOUT: Joi.string().optional(),
  FFMPEG_VIDEO_CODEC: Joi.string().optional(),
  TEMP_DIR: Joi.string().default('public/tmp/videos'),
  WEBSOCKET_URL: Joi.string().default('ws://localhost:3004'),
};
