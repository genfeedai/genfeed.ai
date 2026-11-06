import { VercelWebhookController } from '@api/endpoints/webhooks/vercel/webhooks.vercel.controller';
import type { VercelWebhookService } from '@api/endpoints/webhooks/vercel/webhooks.vercel.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: {
    getCallerName: () => 'vercel callback',
  },
}));

// The fake signer accepts exactly `signed:<raw body>`, so a pass proves the
// controller verified the raw bytes it received with the header it received.
const sign = (rawBody: string) => `signed:${rawBody}`;

describe('VercelWebhookController', () => {
  let controller: VercelWebhookController;
  let handled: unknown[];
  let handlerFailure: Error | undefined;
  let logs: Array<[string, unknown]>;

  const deliver = (rawBody: string, signature = sign(rawBody)) =>
    controller.handleVercel({
      body: Buffer.from(rawBody),
      headers: { 'x-vercel-signature': signature },
    } as unknown as Request);

  beforeEach(() => {
    handled = [];
    handlerFailure = undefined;
    logs = [];
    controller = new VercelWebhookController(
      {
        error: (message: string, detail: unknown) =>
          logs.push([`error: ${message}`, detail]),
        log: (message: string, detail: unknown) =>
          logs.push([`log: ${message}`, detail]),
      } as unknown as LoggerService,
      {
        handleWebhook: async (payload: unknown) => {
          if (handlerFailure) {
            throw handlerFailure;
          }
          handled.push(payload);
        },
        validateSignature: (rawBody: Buffer, signature: string) =>
          signature === sign(rawBody.toString()),
      } as unknown as VercelWebhookService,
    );
  });

  describe('handleVercel', () => {
    it('handles a correctly signed webhook', async () => {
      const payload = { data: 'test', type: 'deployment.ready' };

      await expect(deliver(JSON.stringify(payload))).resolves.toEqual({
        success: true,
      });

      expect(handled).toEqual([payload]);
      expect(logs).toEqual([
        ['log: VercelWebhookController vercel callback received', payload],
      ]);
    });

    it('rejects a bad signature before logging or handling the body', async () => {
      const payload = { data: 'test', type: 'deployment.ready' };

      await expect(
        deliver(JSON.stringify(payload), 'invalid-signature'),
      ).rejects.toThrow(UnauthorizedException);

      expect(handled).toEqual([]);
      expect(logs.map(([message]) => message)).toEqual([
        'error: VercelWebhookController vercel callback invalid signature',
        'error: VercelWebhookController vercel callback failed',
      ]);
    });

    it('rejects a signed body that is not valid JSON with 400', async () => {
      await expect(deliver('not json')).rejects.toThrow(BadRequestException);
      expect(handled).toEqual([]);
    });

    it.each([
      ['an array', []],
      ['a string type', { type: 5 }],
      ['a non-array alias', { payload: { alias: 'example.com' } }],
      [
        'a non-string commit sha',
        { deployment: { meta: { githubCommitSha: 1 } } },
      ],
    ])('rejects a signed body with %s with 400', async (_label, body) => {
      await expect(deliver(JSON.stringify(body))).rejects.toThrow(
        BadRequestException,
      );
      expect(handled).toEqual([]);
    });

    it('accepts null optional fields and unknown keys', async () => {
      const payload = {
        deployment: {
          meta: { githubCommitMessage: null },
          url: 'x.vercel.app',
        },
        extra: { anything: true },
        type: 'deployment.ready',
      };

      await expect(deliver(JSON.stringify(payload))).resolves.toEqual({
        success: true,
      });
      expect(handled).toEqual([payload]);
    });

    it('logs and rethrows when handling the webhook fails', async () => {
      const payload = { data: 'test', type: 'deployment.failed' };
      handlerFailure = new Error('Webhook processing failed');

      await expect(deliver(JSON.stringify(payload))).rejects.toThrow(
        handlerFailure,
      );

      expect(logs).toEqual([
        ['log: VercelWebhookController vercel callback received', payload],
        [
          'error: VercelWebhookController vercel callback failed',
          handlerFailure,
        ],
      ]);
    });
  });
});
