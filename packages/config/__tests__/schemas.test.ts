import {
  argilSchema,
  elevenlabsSchema,
  falSchema,
  fleetSchema,
  generalAiSchema,
  gpuFleetSchema,
  hedraSchema,
  heygenSchema,
  klingaiSchema,
  leonardoSchema,
  murekaSchema,
  newsApiSchema,
  replicateSchema,
  trainingPricingSchema,
} from '@config/schemas/ai.schema';
import { awsOptionalSchema, awsSchema } from '@config/schemas/aws.schema';
import { baseSchema } from '@config/schemas/base.schema';
import { ffmpegSchema } from '@config/schemas/ffmpeg.schema';
import {
  genfeedaiMinimalSchema,
  genfeedaiUrlsSchema,
  internalAuthSchema,
  microservicesSchema,
} from '@config/schemas/genfeedai.schema';
import { googleOAuthSchema } from '@config/schemas/google-oauth.schema';
import {
  discordBotSchema,
  resendSchema,
  telegramBotSchema,
  twitchSchema,
} from '@config/schemas/notifications.schema';
import { redisSchema } from '@config/schemas/redis.schema';
import {
  sentryOptionalSchema,
  sentrySchema,
} from '@config/schemas/sentry.schema';
import {
  allSocialSchema,
  beehiivSchema,
  facebookSchema,
  fanvueSchema,
  instagramSchema,
  linkedinSchema,
  mediumSchema,
  pinterestSchema,
  redditSchema,
  shopifySchema,
  slackSchema,
  snapchatSchema,
  threadsSchema,
  tiktokSchema,
  twitterSchema,
  whatsappSchema,
  wordpressSchema,
  youtubeSchema,
} from '@config/schemas/social.schema';
import { stripeSchema } from '@config/schemas/stripe.schema';
import { webhooksSchema } from '@config/schemas/webhooks.schema';
import Joi from 'joi';
import { describe, expect, it } from 'vitest';

describe('Config Schemas', () => {
  describe('discordBotSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof discordBotSchema).toBe('object');
      const keys = Object.keys(discordBotSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((discordBotSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('telegramBotSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof telegramBotSchema).toBe('object');
      const keys = Object.keys(telegramBotSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((telegramBotSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('resendSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof resendSchema).toBe('object');
      const keys = Object.keys(resendSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((resendSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('twitchSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof twitchSchema).toBe('object');
      const keys = Object.keys(twitchSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((twitchSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('awsSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof awsSchema).toBe('object');
      const keys = Object.keys(awsSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((awsSchema as Record<string, unknown>)[key])).toBe(
          true,
        );
      }
    });
  });

  describe('awsOptionalSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof awsOptionalSchema).toBe('object');
      const keys = Object.keys(awsOptionalSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((awsOptionalSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('generalAiSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof generalAiSchema).toBe('object');
      const keys = Object.keys(generalAiSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((generalAiSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('replicateSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof replicateSchema).toBe('object');
      const keys = Object.keys(replicateSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((replicateSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('klingaiSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof klingaiSchema).toBe('object');
      const keys = Object.keys(klingaiSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((klingaiSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('elevenlabsSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof elevenlabsSchema).toBe('object');
      const keys = Object.keys(elevenlabsSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((elevenlabsSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('leonardoSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof leonardoSchema).toBe('object');
      const keys = Object.keys(leonardoSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((leonardoSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('heygenSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof heygenSchema).toBe('object');
      const keys = Object.keys(heygenSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((heygenSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('argilSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof argilSchema).toBe('object');
      const keys = Object.keys(argilSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((argilSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('hedraSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof hedraSchema).toBe('object');
      const keys = Object.keys(hedraSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((hedraSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('newsApiSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof newsApiSchema).toBe('object');
      const keys = Object.keys(newsApiSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((newsApiSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('fleetSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof fleetSchema).toBe('object');
      const keys = Object.keys(fleetSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((fleetSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });

    it('should allow an empty optional ComfyUI URL from env templates', () => {
      const schema = Joi.object(fleetSchema);
      const { error, value } = schema.validate({
        FLEET_COMFYUI_URL: '',
      });

      expect(error).toBeUndefined();
      expect(value.FLEET_COMFYUI_URL).toBe('');
    });
  });

  describe('gpuFleetSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof gpuFleetSchema).toBe('object');
      const keys = Object.keys(gpuFleetSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((gpuFleetSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('falSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof falSchema).toBe('object');
      const keys = Object.keys(falSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((falSchema as Record<string, unknown>)[key])).toBe(
          true,
        );
      }
    });
  });

  describe('murekaSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof murekaSchema).toBe('object');
      const keys = Object.keys(murekaSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((murekaSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(murekaSchema);
      const { error, value } = schema.validate({}, { allowUnknown: true });
      expect(error).toBeUndefined();
      expect(value.MUREKA_API_BASE_URL).toBe('https://api.mureka.ai');
      expect(value.MUREKA_MODEL).toBe('mureka-9');
    });
  });

  describe('trainingPricingSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof trainingPricingSchema).toBe('object');
      const keys = Object.keys(trainingPricingSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((trainingPricingSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('webhooksSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof webhooksSchema).toBe('object');
      const keys = Object.keys(webhooksSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((webhooksSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('sentrySchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof sentrySchema).toBe('object');
      const keys = Object.keys(sentrySchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((sentrySchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('sentryOptionalSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof sentryOptionalSchema).toBe('object');
      const keys = Object.keys(sentryOptionalSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((sentryOptionalSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('genfeedaiUrlsSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof genfeedaiUrlsSchema).toBe('object');
      const keys = Object.keys(genfeedaiUrlsSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((genfeedaiUrlsSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('microservicesSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof microservicesSchema).toBe('object');
      const keys = Object.keys(microservicesSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((microservicesSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('internalAuthSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof internalAuthSchema).toBe('object');
      const keys = Object.keys(internalAuthSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((internalAuthSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('genfeedaiMinimalSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof genfeedaiMinimalSchema).toBe('object');
      const keys = Object.keys(genfeedaiMinimalSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema(
            (genfeedaiMinimalSchema as Record<string, unknown>)[key],
          ),
        ).toBe(true);
      }
    });
  });

  describe('stripeSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof stripeSchema).toBe('object');
      const keys = Object.keys(stripeSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((stripeSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('redisSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof redisSchema).toBe('object');
      const keys = Object.keys(redisSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((redisSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('baseSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof baseSchema).toBe('object');
      const keys = Object.keys(baseSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((baseSchema as Record<string, unknown>)[key])).toBe(
          true,
        );
      }
    });
  });

  describe('youtubeSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof youtubeSchema).toBe('object');
      const keys = Object.keys(youtubeSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((youtubeSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('googleOAuthSchema', () => {
    it('declares one shared Google OAuth client pair', () => {
      expect(Object.keys(googleOAuthSchema)).toEqual([
        'GOOGLE_OAUTH_CLIENT_ID',
        'GOOGLE_OAUTH_CLIENT_SECRET',
      ]);
      expect(Joi.isSchema(googleOAuthSchema.GOOGLE_OAUTH_CLIENT_ID)).toBe(true);
      expect(Joi.isSchema(googleOAuthSchema.GOOGLE_OAUTH_CLIENT_SECRET)).toBe(
        true,
      );
    });
  });

  describe('tiktokSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof tiktokSchema).toBe('object');
      const keys = Object.keys(tiktokSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((tiktokSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('instagramSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof instagramSchema).toBe('object');
      const keys = Object.keys(instagramSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((instagramSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('facebookSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof facebookSchema).toBe('object');
      const keys = Object.keys(facebookSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((facebookSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('twitterSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof twitterSchema).toBe('object');
      const keys = Object.keys(twitterSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((twitterSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('pinterestSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof pinterestSchema).toBe('object');
      const keys = Object.keys(pinterestSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((pinterestSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('redditSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof redditSchema).toBe('object');
      const keys = Object.keys(redditSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((redditSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('linkedinSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof linkedinSchema).toBe('object');
      const keys = Object.keys(linkedinSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((linkedinSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('mediumSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof mediumSchema).toBe('object');
      const keys = Object.keys(mediumSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((mediumSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('fanvueSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof fanvueSchema).toBe('object');
      const keys = Object.keys(fanvueSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((fanvueSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('threadsSchema', () => {
    it('covers every Threads setting consumed by the API', () => {
      expect(Object.keys(threadsSchema).sort()).toEqual([
        'THREADS_API_VERSION',
        'THREADS_CLIENT_ID',
        'THREADS_CLIENT_SECRET',
        'THREADS_GRAPH_URL',
        'THREADS_REDIRECT_URI',
      ]);
      for (const value of Object.values(threadsSchema)) {
        expect(Joi.isSchema(value)).toBe(true);
      }
    });
  });

  describe('slackSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof slackSchema).toBe('object');
      const keys = Object.keys(slackSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((slackSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('wordpressSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof wordpressSchema).toBe('object');
      const keys = Object.keys(wordpressSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((wordpressSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('snapchatSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof snapchatSchema).toBe('object');
      const keys = Object.keys(snapchatSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((snapchatSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('whatsappSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof whatsappSchema).toBe('object');
      const keys = Object.keys(whatsappSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((whatsappSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('shopifySchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof shopifySchema).toBe('object');
      const keys = Object.keys(shopifySchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((shopifySchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('beehiivSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof beehiivSchema).toBe('object');
      const keys = Object.keys(beehiivSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((beehiivSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });
  });

  describe('allSocialSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof allSocialSchema).toBe('object');
      const keys = Object.keys(allSocialSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((allSocialSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });

    // Regression guard for #90: Mastodon and Ghost are instance-/self-host
    // specific, so their endpoint is resolved per stored credential, not from
    // a single global env var. These stale config keys were removed and must
    // not be reintroduced without a live service consumer.
    it('should not declare unused per-credential default endpoint keys', () => {
      const keys = Object.keys(allSocialSchema);
      expect(keys).not.toContain('MASTODON_DEFAULT_INSTANCE_URL');
      expect(keys).not.toContain('GHOST_DEFAULT_API_URL');
    });

    it('does not reintroduce per-integration Google OAuth client aliases', () => {
      const keys = Object.keys(allSocialSchema);
      expect(keys).not.toContain('YOUTUBE_CLIENT_ID');
      expect(keys).not.toContain('YOUTUBE_CLIENT_SECRET');
      expect(keys).not.toContain('GOOGLE_ADS_CLIENT_ID');
      expect(keys).not.toContain('GOOGLE_ADS_CLIENT_SECRET');
      expect(keys).not.toContain('GOOGLE_SEARCH_CONSOLE_CLIENT_ID');
      expect(keys).not.toContain('GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET');
    });
  });

  describe('ffmpegSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof ffmpegSchema).toBe('object');
      const keys = Object.keys(ffmpegSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          Joi.isSchema((ffmpegSchema as Record<string, unknown>)[key]),
        ).toBe(true);
      }
    });

    it('accepts the configured local websocket endpoint without inventing a default', () => {
      const schema = Joi.object(ffmpegSchema);

      const configured = schema.validate({
        WEBSOCKET_URL: 'ws://genfeed.localhost:3111',
      });
      const unconfigured = schema.validate({});

      expect(configured.error).toBeUndefined();
      expect(configured.value.WEBSOCKET_URL).toBe(
        'ws://genfeed.localhost:3111',
      );
      expect(unconfigured.value.WEBSOCKET_URL).toBeUndefined();
    });
  });
});
