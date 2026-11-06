import { createHmac } from 'node:crypto';
import type { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import type { TrainingsService } from '@api/collections/trainings/services/trainings.service';
import type { ReplicateGenerationWebhookHandler } from '@api/endpoints/webhooks/replicate/handlers/replicate-generation-webhook.handler';
import { ReplicateWebhookController } from '@api/endpoints/webhooks/replicate/webhooks.replicate.controller';
import type { ReplicateWebhookVerificationService } from '@api/endpoints/webhooks/replicate/webhooks.replicate.verification.service';
import type { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { IngredientStatus, TrainingStatus } from '@genfeedai/contracts';
import type { ConfigService } from '@libs/config/config.service';
import type { ReplicateWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import type { LoggerService } from '@libs/logger/logger.service';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { beforeEach, describe, expect, it } from 'vitest';

type Row = Record<string, unknown>;

const KEY = Buffer.from('local-callback-test-key');
const SECRET = `whsec_${KEY.toString('base64')}`;
const TIMESTAMP = '1700000000';

/** A delivery signed with the endpoint secret, exactly as Replicate signs it. */
function signed(
  rawBody: string,
  { deliveryId = 'msg_abc', key = KEY, sentBytes = rawBody } = {},
): RawBodyRequest<Request> {
  const signature = createHmac('sha256', key)
    .update(`${deliveryId}.${TIMESTAMP}.${rawBody}`)
    .digest('base64');
  return {
    headers: {
      'webhook-id': deliveryId,
      'webhook-signature': `v1,${signature}`,
      'webhook-timestamp': TIMESTAMP,
    },
    rawBody: Buffer.from(sentBytes),
  } as unknown as RawBodyRequest<Request>;
}
const signedJson = (body: Row, options = {}) =>
  signed(JSON.stringify(body), options);

/** Lets the setImmediate processing run after the 200 is returned. */
const flushAsyncProcessing = () =>
  new Promise((resolve) => setImmediate(resolve));

describe('ReplicateWebhookController', () => {
  let configuredSecret: string | undefined;
  // Replicate's own record of each prediction or training, by id; null when
  // the record cannot be read.
  let replicateRecords: Map<string, Row | null>;
  let seenDeliveries: Set<string>;
  let trainings: Row[];
  // Effects of each delivery.
  let verifiedAs: [unknown, string][];
  let deferred: unknown[];
  let completed: [Row, string | undefined][];
  let failed: [Row, string | undefined][];
  let trainingStatuses: unknown[][];
  let registered: Row[];
  let errors: unknown[][];
  let controller: ReplicateWebhookController;

  const deliver = (
    body: Row,
    request = signedJson(body),
    continuation?: string,
  ) =>
    controller.handleCallback(
      request,
      body as unknown as ReplicateWebhookPayload,
      continuation,
    );
  const training = () => trainings[0] as Row;

  beforeEach(() => {
    configuredSecret = SECRET;
    replicateRecords = new Map();
    seenDeliveries = new Set();
    trainings = [];
    verifiedAs = [];
    deferred = [];
    completed = [];
    failed = [];
    trainingStatuses = [];
    registered = [];
    errors = [];

    controller = new ReplicateWebhookController(
      { get: () => configuredSecret } as unknown as ConfigService,
      {
        error: (...entry: unknown[]) => {
          errors.push(entry);
        },
        log: () => undefined,
        warn: () => undefined,
      } as unknown as LoggerService,
      {
        findOne: async ({ externalId }: Row) =>
          trainings.find((row) => row.externalId === externalId) ?? null,
        patch: async (id: string, data: Row) =>
          Object.assign(trainings.find((row) => row.id === id) as Row, data),
      } as unknown as TrainingsService,
      {
        publishTrainingStatus: async (...args: unknown[]) => {
          trainingStatuses.push(args);
        },
      } as unknown as NotificationsPublisherService,
      {
        createFromTraining: async (row: Row) => {
          registered.push({ ...row });
        },
      } as unknown as ModelRegistrationService,
      {
        handleCompleted: async (payload: Row, continuation?: string) => {
          completed.push([payload, continuation]);
        },
        handleFailed: async (payload: Row, continuation?: string) => {
          failed.push([payload, continuation]);
        },
      } as unknown as ReplicateGenerationWebhookHandler,
      {
        deferUntrustedDelivery: async (payload: Row) => {
          deferred.push(payload);
        },
        isReplay: async (deliveryId: string) => {
          if (seenDeliveries.has(deliveryId)) return true;
          seenDeliveries.add(deliveryId);
          return false;
        },
        resolveTrustedPayload: async (payload: Row, kind: string) => {
          verifiedAs.push([payload.id, kind]);
          return replicateRecords.has(String(payload.id))
            ? replicateRecords.get(String(payload.id))
            : payload;
        },
      } as unknown as ReplicateWebhookVerificationService,
    );
  });

  describe('signature', () => {
    it.each([
      [
        'pretty JSON',
        '{\n  "id": "pred_raw",\n  "status": "succeeded"\n}',
        { id: 'pred_raw', status: 'succeeded' },
      ],
      [
        'escaped Unicode',
        '{"id":"pred_raw","status":"succeeded","note":"\\u0061"}',
        { id: 'pred_raw', note: 'a', status: 'succeeded' },
      ],
      [
        'exponent notation',
        '{"id":"pred_raw","status":"succeeded","metric":1e+3}',
        { id: 'pred_raw', metric: 1000, status: 'succeeded' },
      ],
      [
        'a UTF-8 BOM',
        '﻿{"id":"pred_raw","status":"succeeded"}',
        { id: 'pred_raw', status: 'succeeded' },
      ],
    ])(
      'authenticates the original bytes for %s',
      async (_case, rawBody, body) => {
        await expect(
          deliver(body, signed(rawBody, { deliveryId: 'msg_raw' })),
        ).resolves.toEqual({
          detail: 'Webhook processed',
        });
        await flushAsyncProcessing();

        expect(seenDeliveries.has('msg_raw')).toBe(true);
      },
    );

    it.each([
      [
        'altered captured bytes',
        signed('{ "id": "pred_raw", "status": "succeeded" }', {
          sentBytes: '{ "id": "pred_raw", "status": "succeeded" } ',
        }),
      ],
      [
        'a signature made with another key',
        signedJson(
          { id: 'pred_raw', status: 'succeeded' },
          { key: Buffer.from('attacker-key') },
        ),
      ],
      [
        'no captured body bytes',
        {
          headers: { 'webhook-id': 'msg_abc' },
        } as unknown as RawBodyRequest<Request>,
      ],
    ])(
      'rejects %s with 401 before replay checks or downstream work',
      async (_case, request) => {
        await expect(
          deliver({ id: 'pred_raw', status: 'succeeded' }, request),
        ).rejects.toMatchObject({ status: 401 });
        await flushAsyncProcessing();

        expect(seenDeliveries.size).toBe(0);
        expect(verifiedAs).toEqual([]);
      },
    );

    it.each([
      ['not configured', undefined],
      ['blank', '   '],
    ])('fails closed when the signing secret is %s', async (_case, secret) => {
      configuredSecret = secret;

      await expect(
        deliver({ id: 'pred_456', status: 'succeeded' }),
      ).rejects.toMatchObject({
        status: 401,
      });

      expect(seenDeliveries.size).toBe(0);
      expect(errors).toContainEqual([
        expect.stringContaining(
          'REPLICATE_WEBHOOK_SIGNING_SECRET is not configured',
        ),
      ]);
    });
  });

  describe('predictions', () => {
    it('hands a trusted completed prediction to the generation handler with its continuation', async () => {
      const body = {
        id: 'pred_123',
        model: 'owner/model',
        output: ['result.png'],
        status: 'succeeded',
      };

      await expect(
        deliver(body, signedJson(body), 'continuation-1'),
      ).resolves.toEqual({
        detail: 'Webhook processed',
      });
      await flushAsyncProcessing();

      expect(verifiedAs).toEqual([['pred_123', 'prediction']]);
      expect(completed).toEqual([[body, 'continuation-1']]);
    });

    it('suppresses a replayed delivery without processing it again', async () => {
      const body = {
        id: 'pred_replay',
        model: 'owner/model',
        status: 'succeeded',
      };

      await deliver(body);
      await flushAsyncProcessing();
      await expect(deliver(body)).resolves.toEqual({
        detail: 'Webhook already processed',
      });
      await flushAsyncProcessing();

      expect(completed).toHaveLength(1);
    });

    it('acts on Replicate’s own record, not the signed body', async () => {
      // A signed body claiming success for a prediction that actually failed.
      const body = {
        id: 'pred_forged',
        model: 'owner/model',
        output: ['https://evil.example.com/forged.png'],
        status: 'succeeded',
      };
      replicateRecords.set('pred_forged', {
        ...body,
        output: null,
        status: 'failed',
      });

      await deliver(body);
      await flushAsyncProcessing();

      expect(completed).toEqual([]);
      expect(failed).toEqual([
        [
          expect.objectContaining({ id: 'pred_forged', status: 'failed' }),
          undefined,
        ],
      ]);
    });

    it('fails the generation of a canceled prediction instead of leaving it processing', async () => {
      const body = {
        id: 'pred_canceled',
        model: 'owner/model',
        status: 'canceled',
      };

      await deliver(body);
      await flushAsyncProcessing();

      expect(failed).toEqual([[body, undefined]]);
    });

    it('defers a delivery whose prediction cannot be read from Replicate', async () => {
      const body = {
        id: 'pred_untrusted',
        model: 'owner/model',
        status: 'succeeded',
      };
      replicateRecords.set('pred_untrusted', null);

      await deliver(body);
      await flushAsyncProcessing();

      expect(deferred).toEqual([body]);
      expect([completed, failed]).toEqual([[], []]);
    });

    it('ignores a signed resource-kind claim when no training row exists', async () => {
      const body = {
        id: 'pred_123',
        resourceKind: 'training',
        status: 'succeeded',
      };

      await deliver(body);
      await flushAsyncProcessing();

      expect(verifiedAs).toEqual([['pred_123', 'prediction']]);
    });
  });

  describe('trainings', () => {
    beforeEach(() => {
      trainings = [
        {
          config: { steps: 1000 },
          externalId: 'train_123',
          id: 'training_db',
          stage: 'TRAINING',
          userId: 'user_123',
        },
      ];
    });

    it('verifies against the training record, marks it ready and registers the model', async () => {
      const body = { id: 'train_123', status: 'succeeded' };
      replicateRecords.set('train_123', {
        ...body,
        output: { version: 'owner/trained:version' },
      });

      await deliver(body);
      await flushAsyncProcessing();

      expect(verifiedAs).toEqual([['train_123', 'training']]);
      expect(training()).toMatchObject({
        config: {
          model: 'owner/trained:version',
          status: TrainingStatus.COMPLETED,
          steps: 1000,
          trainedModelVersion: 'owner/trained:version',
        },
        stage: 'READY',
      });
      expect(registered).toEqual([
        expect.objectContaining({ id: 'training_db', stage: 'READY' }),
      ]);
      expect(trainingStatuses).toEqual([
        [
          'training_db',
          IngredientStatus.GENERATED,
          'user_123',
          expect.objectContaining({ status: TrainingStatus.COMPLETED }),
        ],
      ]);
      expect(completed).toEqual([]);
    });

    it('defers untrusted training state without completion writes', async () => {
      replicateRecords.set('train_123', null);

      await deliver({ id: 'train_123', status: 'succeeded' });
      await flushAsyncProcessing();

      expect(deferred).toEqual([{ id: 'train_123', status: 'succeeded' }]);
      expect(training().stage).toBe('TRAINING');
      expect(registered).toEqual([]);
    });

    it('uses the authoritative failed training status instead of signed success', async () => {
      const body = { id: 'train_123', status: 'succeeded' };
      replicateRecords.set('train_123', {
        ...body,
        error: 'remote failure',
        status: 'failed',
      });

      await deliver(body);
      await flushAsyncProcessing();

      expect(training()).toMatchObject({
        config: {
          error: 'remote failure',
          status: TrainingStatus.FAILED,
          steps: 1000,
        },
        stage: 'FAILED',
      });
      expect(trainingStatuses).toEqual([
        [
          'training_db',
          IngredientStatus.FAILED,
          'user_123',
          expect.objectContaining({ error: 'remote failure' }),
        ],
      ]);
      expect(registered).toEqual([]);
      expect(failed).toEqual([]);
    });
  });
});
