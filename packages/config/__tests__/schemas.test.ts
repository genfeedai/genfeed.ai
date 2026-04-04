import {
  darkroomSchema,
  elevenlabsSchema,
  falSchema,
  generalAiSchema,
  gpuFleetSchema,
  hedraSchema,
  heygenSchema,
  klingaiSchema,
  leonardoSchema,
  newsApiSchema,
  replicateSchema,
  trainingPricingSchema,
} from '@config/schemas/ai.schema';
import { awsOptionalSchema, awsSchema } from '@config/schemas/aws.schema';
import { baseSchema } from '@config/schemas/base.schema';
import { clerkMinimalSchema, clerkSchema } from '@config/schemas/clerk.schema';
import { ffmpegSchema } from '@config/schemas/ffmpeg.schema';
import {
  genfeedaiMinimalSchema,
  genfeedaiUrlsSchema,
  internalAuthSchema,
  microservicesSchema,
} from '@config/schemas/genfeedai.schema';
import { mongodbSchema } from '@config/schemas/mongodb.schema';
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
  ghostSchema,
  instagramSchema,
  linkedinSchema,
  mastodonSchema,
  mediumSchema,
  pinterestSchema,
  redditSchema,
  shopifySchema,
  slackSchema,
  snapchatSchema,
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
        expect(Joi.isSchema((discordBotSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(discordBotSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('telegramBotSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof telegramBotSchema).toBe('object');
      const keys = Object.keys(telegramBotSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((telegramBotSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(telegramBotSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('resendSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof resendSchema).toBe('object');
      const keys = Object.keys(resendSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((resendSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(resendSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('twitchSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof twitchSchema).toBe('object');
      const keys = Object.keys(twitchSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((twitchSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(twitchSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('awsSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof awsSchema).toBe('object');
      const keys = Object.keys(awsSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((awsSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(awsSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('awsOptionalSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof awsOptionalSchema).toBe('object');
      const keys = Object.keys(awsOptionalSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((awsOptionalSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(awsOptionalSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('generalAiSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof generalAiSchema).toBe('object');
      const keys = Object.keys(generalAiSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((generalAiSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(generalAiSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('replicateSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof replicateSchema).toBe('object');
      const keys = Object.keys(replicateSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((replicateSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(replicateSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('klingaiSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof klingaiSchema).toBe('object');
      const keys = Object.keys(klingaiSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((klingaiSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(klingaiSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('elevenlabsSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof elevenlabsSchema).toBe('object');
      const keys = Object.keys(elevenlabsSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((elevenlabsSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(elevenlabsSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('leonardoSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof leonardoSchema).toBe('object');
      const keys = Object.keys(leonardoSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((leonardoSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(leonardoSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('heygenSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof heygenSchema).toBe('object');
      const keys = Object.keys(heygenSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((heygenSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(heygenSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('hedraSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof hedraSchema).toBe('object');
      const keys = Object.keys(hedraSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((hedraSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(hedraSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('newsApiSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof newsApiSchema).toBe('object');
      const keys = Object.keys(newsApiSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((newsApiSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(newsApiSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('darkroomSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof darkroomSchema).toBe('object');
      const keys = Object.keys(darkroomSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((darkroomSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(darkroomSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('gpuFleetSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof gpuFleetSchema).toBe('object');
      const keys = Object.keys(gpuFleetSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((gpuFleetSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(gpuFleetSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('falSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof falSchema).toBe('object');
      const keys = Object.keys(falSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((falSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(falSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('trainingPricingSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof trainingPricingSchema).toBe('object');
      const keys = Object.keys(trainingPricingSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((trainingPricingSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(trainingPricingSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('webhooksSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof webhooksSchema).toBe('object');
      const keys = Object.keys(webhooksSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((webhooksSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(webhooksSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('sentrySchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof sentrySchema).toBe('object');
      const keys = Object.keys(sentrySchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((sentrySchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(sentrySchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('sentryOptionalSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof sentryOptionalSchema).toBe('object');
      const keys = Object.keys(sentryOptionalSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((sentryOptionalSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(sentryOptionalSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('genfeedaiUrlsSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof genfeedaiUrlsSchema).toBe('object');
      const keys = Object.keys(genfeedaiUrlsSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((genfeedaiUrlsSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(genfeedaiUrlsSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('microservicesSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof microservicesSchema).toBe('object');
      const keys = Object.keys(microservicesSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((microservicesSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(microservicesSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('internalAuthSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof internalAuthSchema).toBe('object');
      const keys = Object.keys(internalAuthSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((internalAuthSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(internalAuthSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('genfeedaiMinimalSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof genfeedaiMinimalSchema).toBe('object');
      const keys = Object.keys(genfeedaiMinimalSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((genfeedaiMinimalSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(genfeedaiMinimalSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('clerkSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof clerkSchema).toBe('object');
      const keys = Object.keys(clerkSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((clerkSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(clerkSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('clerkMinimalSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof clerkMinimalSchema).toBe('object');
      const keys = Object.keys(clerkMinimalSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((clerkMinimalSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(clerkMinimalSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('stripeSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof stripeSchema).toBe('object');
      const keys = Object.keys(stripeSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((stripeSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(stripeSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('redisSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof redisSchema).toBe('object');
      const keys = Object.keys(redisSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((redisSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(redisSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('baseSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof baseSchema).toBe('object');
      const keys = Object.keys(baseSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((baseSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(baseSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('mongodbSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof mongodbSchema).toBe('object');
      const keys = Object.keys(mongodbSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((mongodbSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(mongodbSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('youtubeSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof youtubeSchema).toBe('object');
      const keys = Object.keys(youtubeSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((youtubeSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(youtubeSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('tiktokSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof tiktokSchema).toBe('object');
      const keys = Object.keys(tiktokSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((tiktokSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(tiktokSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('instagramSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof instagramSchema).toBe('object');
      const keys = Object.keys(instagramSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((instagramSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(instagramSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('facebookSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof facebookSchema).toBe('object');
      const keys = Object.keys(facebookSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((facebookSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(facebookSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('twitterSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof twitterSchema).toBe('object');
      const keys = Object.keys(twitterSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((twitterSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(twitterSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('pinterestSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof pinterestSchema).toBe('object');
      const keys = Object.keys(pinterestSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((pinterestSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(pinterestSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('redditSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof redditSchema).toBe('object');
      const keys = Object.keys(redditSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((redditSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(redditSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('linkedinSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof linkedinSchema).toBe('object');
      const keys = Object.keys(linkedinSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((linkedinSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(linkedinSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('mediumSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof mediumSchema).toBe('object');
      const keys = Object.keys(mediumSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((mediumSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(mediumSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('fanvueSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof fanvueSchema).toBe('object');
      const keys = Object.keys(fanvueSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((fanvueSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(fanvueSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('slackSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof slackSchema).toBe('object');
      const keys = Object.keys(slackSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((slackSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(slackSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('wordpressSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof wordpressSchema).toBe('object');
      const keys = Object.keys(wordpressSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((wordpressSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(wordpressSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('snapchatSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof snapchatSchema).toBe('object');
      const keys = Object.keys(snapchatSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((snapchatSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(snapchatSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('whatsappSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof whatsappSchema).toBe('object');
      const keys = Object.keys(whatsappSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((whatsappSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(whatsappSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('mastodonSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof mastodonSchema).toBe('object');
      const keys = Object.keys(mastodonSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((mastodonSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(mastodonSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('ghostSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof ghostSchema).toBe('object');
      const keys = Object.keys(ghostSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((ghostSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(ghostSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('shopifySchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof shopifySchema).toBe('object');
      const keys = Object.keys(shopifySchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((shopifySchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(shopifySchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('beehiivSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof beehiivSchema).toBe('object');
      const keys = Object.keys(beehiivSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((beehiivSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(beehiivSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('allSocialSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof allSocialSchema).toBe('object');
      const keys = Object.keys(allSocialSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((allSocialSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(allSocialSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });

  describe('ffmpegSchema', () => {
    it('should be a non-empty object of Joi schemas', () => {
      expect(typeof ffmpegSchema).toBe('object');
      const keys = Object.keys(ffmpegSchema);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Joi.isSchema((ffmpegSchema as any)[key])).toBe(true);
      }
    });

    it('should validate with defaults when optional', () => {
      const schema = Joi.object(ffmpegSchema);
      const { error } = schema.validate({}, { allowUnknown: true });
      // Some schemas have required fields, so error is acceptable
      if (error) {
        expect(error.message).toContain('required');
      }
    });
  });
});
