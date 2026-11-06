import { createHmac } from 'node:crypto';
import { HeygenWebhookController } from '@api/endpoints/webhooks/heygen/webhooks.heygen.controller';
import type { HeygenWebhookService } from '@api/endpoints/webhooks/heygen/webhooks.heygen.service';
import { HeygenWebhookVerificationService } from '@api/endpoints/webhooks/heygen/webhooks.heygen.verification.service';
import type { CacheService } from '@api/services/cache/cache.service';
import type { ConfigService } from '@libs/config/config.service';
import type { HeygenWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { beforeEach, describe, expect, it } from 'vitest';

const SECRET = 'heygen-signing-secret';

const sign = (body: Buffer) =>
  createHmac('sha256', SECRET).update(body).digest('hex');

/** A delivery as express hands it over once `express.raw` has run. */
const delivery = (body: unknown, signature?: string): Request => {
  const raw = Buffer.from(
    typeof body === 'string' ? body : JSON.stringify(body),
  );
  return {
    body: raw,
    headers: { signature: signature ?? sign(raw) },
  } as unknown as Request;
};

const success = {
  event_data: { video_id: 'video-1', url: 'https://cdn.heygen/video-1.mp4' },
  event_type: 'avatar_video.success',
};

describe('HeygenWebhookController', () => {
  let claims: Set<string>;
  let isCacheDown: boolean;
  let processed: HeygenWebhookPayload[];
  let isProcessingDown: boolean;
  let controller: HeygenWebhookController;

  beforeEach(() => {
    claims = new Set();
    isCacheDown = false;
    processed = [];
    isProcessingDown = false;

    // The replay cache: a key can be claimed once until it is released.
    const cache = {
      claimOnce: async (key: string) => {
        if (isCacheDown) return 'unavailable';
        if (claims.has(key)) return 'duplicate';
        claims.add(key);
        return 'claimed';
      },
      del: async (key: string) => {
        claims.delete(key);
      },
      generateKey: (...parts: string[]) => parts.join(':'),
    } as unknown as CacheService;
    const logger = {
      error: () => undefined,
      log: () => undefined,
      warn: () => undefined,
    } as unknown as LoggerService;
    const verification = new HeygenWebhookVerificationService(
      cache,
      {
        get: (key: string) =>
          key === 'HEYGEN_WEBHOOK_SECRET' ? SECRET : undefined,
      } as unknown as ConfigService,
      logger,
    );
    const webhooks = {
      handleCallback: async (payload: HeygenWebhookPayload) => {
        if (isProcessingDown) throw new Error('Video update failed');
        processed.push(payload);
      },
    } as unknown as HeygenWebhookService;

    controller = new HeygenWebhookController(logger, webhooks, verification);
  });

  it('processes a delivery signed over its exact bytes', async () => {
    await expect(controller.handleCallback(delivery(success))).resolves.toEqual(
      { detail: 'Webhook received' },
    );
    expect(processed).toEqual([success]);
  });

  it.each([
    [
      'a forged signature',
      delivery(success, 'a'.repeat(64)),
      'Invalid signature',
    ],
    ['no signature', delivery(success, ''), 'Missing signature header'],
    [
      'a signature over other bytes',
      delivery(success, sign(Buffer.from('{}'))),
      'Invalid signature',
    ],
  ])('refuses %s', async (_case, request, message) => {
    await expect(controller.handleCallback(request)).rejects.toEqual(
      new UnauthorizedException(message),
    );
    expect(processed).toEqual([]);
  });

  it('refuses a body that was parsed before it could be verified', async () => {
    await expect(
      controller.handleCallback({
        body: success,
        headers: { signature: sign(Buffer.from(JSON.stringify(success))) },
      } as unknown as Request),
    ).rejects.toEqual(new BadRequestException('Raw webhook body is required'));
    expect(processed).toEqual([]);
  });

  it.each([
    ['not JSON', 'not-json', 'Webhook body must be valid JSON'],
    ['a JSON array', [success], 'Webhook body is required'],
    ['JSON null', 'null', 'Webhook body is required'],
  ])('refuses a signed body that is %s', async (_case, body, message) => {
    await expect(controller.handleCallback(delivery(body))).rejects.toEqual(
      new BadRequestException(message),
    );
    expect(processed).toEqual([]);
  });

  it('suppresses a replayed delivery', async () => {
    await controller.handleCallback(delivery(success));

    await expect(controller.handleCallback(delivery(success))).resolves.toEqual(
      { detail: 'Webhook already processed' },
    );
    expect(processed).toHaveLength(1);
  });

  it.each([
    [
      'the success and failure of one video',
      success,
      { event_data: { video_id: 'video-1' }, event_type: 'avatar_video.fail' },
    ],
    [
      'two unidentified deliveries with different bytes',
      { event_type: 'ping', nonce: 1 },
      { event_type: 'ping', nonce: 2 },
    ],
  ])('processes %s separately', async (_case, first, second) => {
    await controller.handleCallback(delivery(first));
    await controller.handleCallback(delivery(second));

    expect(processed).toEqual([first, second]);
  });

  it('processes deliveries while the replay cache is down', async () => {
    isCacheDown = true;

    await controller.handleCallback(delivery(success));
    await controller.handleCallback(delivery(success));

    expect(processed).toHaveLength(2);
  });

  it('lets HeyGen retry a delivery whose processing failed', async () => {
    isProcessingDown = true;
    await expect(controller.handleCallback(delivery(success))).rejects.toThrow(
      'Video update failed',
    );
    expect(claims.size).toBe(0);

    isProcessingDown = false;
    await expect(controller.handleCallback(delivery(success))).resolves.toEqual(
      { detail: 'Webhook received' },
    );
    expect(processed).toEqual([success]);
  });
});
