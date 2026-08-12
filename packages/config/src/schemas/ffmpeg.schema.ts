import Joi from 'joi';

const DEFAULT_FFMPEG_MAX_CONCURRENCY = '4';

const positiveSafeIntegerString = Joi.string()
  .trim()
  .custom((value: string, helpers) => {
    const parsedValue = Number(value);

    if (
      !/^\d+$/.test(value) ||
      !Number.isSafeInteger(parsedValue) ||
      parsedValue < 1
    ) {
      return helpers.error('any.invalid');
    }

    return value;
  }, 'positive safe integer validation');

/**
 * FFmpeg config for Files service
 */
export const ffmpegSchema = {
  FFMPEG_AUDIO_CODEC: Joi.string().optional(),
  FFMPEG_CRF: Joi.string().optional(),
  FFMPEG_MAX_CONCURRENCY: positiveSafeIntegerString
    .empty('')
    .default(DEFAULT_FFMPEG_MAX_CONCURRENCY),
  FFMPEG_MAX_PROCESSES: Joi.string().optional(),
  FFMPEG_PIXEL_FORMAT: Joi.string().optional(),
  FFMPEG_PRESET: Joi.string().optional(),
  FFMPEG_TEMP_DIR: Joi.string().optional(),
  FFMPEG_THREADS: Joi.number().default(2),
  FFMPEG_TIMEOUT: Joi.string().optional(),
  FFMPEG_VIDEO_CODEC: Joi.string().optional(),
  TEMP_DIR: Joi.string().default('public/tmp/videos'),
  WEBSOCKET_URL: Joi.string().uri().optional().allow(''),
};
