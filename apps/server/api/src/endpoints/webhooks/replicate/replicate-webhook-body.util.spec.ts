import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { createReplicateWebhookBodyParser } from '@api/endpoints/webhooks/replicate/replicate-webhook-body.util';
import type { RawBodyRequest } from '@nestjs/common';
import express from 'express';

function createRequest(
  url = '/v1/webhooks/replicate/callback',
  method = 'POST',
  body = '{\n  "id": "pred_123", "value": 1e+3, "note": "\\u0061"\n}',
) {
  const request: RawBodyRequest<IncomingMessage> = new IncomingMessage(
    new Socket(),
  );
  request.method = method;
  request.url = url;
  request.headers = {
    'content-length': String(Buffer.byteLength(body)),
    'content-type': 'application/json',
  };
  request.push(Buffer.from(body));
  request.push(null);
  return { body, request, response: new ServerResponse(request) };
}

async function parse(
  parser: ReturnType<typeof express.json>,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    parser(request, response, (error?: unknown) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

describe('Replicate webhook JSON body capture', () => {
  it.each([
    '/v1/webhooks/replicate/callback',
    '/v1/webhooks/replicate/callback/',
    '/v1/webhooks/replicate/callback?workflowContinuationId=continuation',
    '/v1/webhooks/replicate/callback/?workflowContinuationId=continuation',
    '/V1/WEBHOOKS/REPLICATE/CALLBACK',
  ])('captures original bytes and retains parsed JSON for %s', async (url) => {
    const { body, request, response } = createRequest(url);
    try {
      await parse(createReplicateWebhookBodyParser('v1'), request, response);
      expect(request.rawBody).toEqual(Buffer.from(body));
      expect(Reflect.get(request, 'body')).toEqual({
        id: 'pred_123',
        note: 'a',
        value: 1000,
      });
      const parsed: unknown = Reflect.get(request, 'body');
      await parse(express.json({ limit: '50mb' }), request, response);
      expect(Reflect.get(request, 'body')).toBe(parsed);
      expect(request.rawBody).toEqual(Buffer.from(body));
    } finally {
      request.destroy();
    }
  });

  it.each([
    ['/v1/webhooks/replicate/callback/extra', 'POST'],
    ['/v1/webhooks/replicate/callbacks', 'POST'],
    ['/v1/webhooks/replicate/callback//', 'POST'],
    ['/v1/webhooks/replicate/../replicate/callback', 'POST'],
    ['/v1/webhooks/stripe', 'POST'],
    ['/v1/webhooks/replicate/callback', 'GET'],
    ['/webhooks/replicate/callback', 'POST'],
  ])(
    'leaves unrelated route %s (%s) for its own parser',
    async (url, method) => {
      const { request, response } = createRequest(url, method);
      try {
        await parse(createReplicateWebhookBodyParser('v1'), request, response);
        expect(request.rawBody).toBeUndefined();
        expect(Reflect.get(request, 'body')).toBeUndefined();
      } finally {
        request.destroy();
      }
    },
  );

  it('retains the existing 50 MB limit without allocating an oversized body', async () => {
    const { request, response } = createRequest();
    request.headers['content-length'] = String(50 * 1024 * 1024 + 1);
    try {
      await expect(
        parse(createReplicateWebhookBodyParser('v1'), request, response),
      ).rejects.toMatchObject({ status: 413, type: 'entity.too.large' });
      expect(request.rawBody).toBeUndefined();
    } finally {
      request.destroy();
    }
  });

  it('preserves JSON parse rejection instead of accepting raw invalid JSON', async () => {
    const { request, response } = createRequest(undefined, undefined, '{"id":');
    try {
      await expect(
        parse(createReplicateWebhookBodyParser('v1'), request, response),
      ).rejects.toMatchObject({ status: 400, type: 'entity.parse.failed' });
    } finally {
      request.destroy();
    }
  });
});
