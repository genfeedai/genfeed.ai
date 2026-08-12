import Joi from 'joi';

import { ffmpegSchema } from './ffmpeg.schema';

describe('FFmpeg config schema', () => {
  const schema = Joi.object(ffmpegSchema);

  it.each([undefined, '', '   '])(
    'defaults absent or empty FFMPEG_MAX_CONCURRENCY (%p) to 4',
    (configuredValue) => {
      const input =
        configuredValue === undefined
          ? {}
          : { FFMPEG_MAX_CONCURRENCY: configuredValue };
      const { error, value } = schema.validate(input);

      expect(error).toBeUndefined();
      expect(value.FFMPEG_MAX_CONCURRENCY).toBe('4');
    },
  );

  it.each(['0', '-1', '1.5', 'not-a-number', '9007199254740992'])(
    'rejects invalid FFMPEG_MAX_CONCURRENCY %p',
    (configuredValue) => {
      const { error } = schema.validate({
        FFMPEG_MAX_CONCURRENCY: configuredValue,
      });

      expect(error).toBeDefined();
    },
  );

  it.each(['1', '4', String(Number.MAX_SAFE_INTEGER)])(
    'accepts positive safe integer FFMPEG_MAX_CONCURRENCY %p',
    (configuredValue) => {
      const { error, value } = schema.validate({
        FFMPEG_MAX_CONCURRENCY: configuredValue,
      });

      expect(error).toBeUndefined();
      expect(value.FFMPEG_MAX_CONCURRENCY).toBe(configuredValue);
    },
  );
});
