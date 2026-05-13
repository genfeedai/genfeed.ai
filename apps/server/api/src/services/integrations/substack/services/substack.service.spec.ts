import { BadRequestException } from '@nestjs/common';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

const dnsLookupMock = vi.hoisted(() => vi.fn());

vi.mock('node:dns/promises', () => ({
  lookup: dnsLookupMock,
}));

import { SubstackService } from './substack.service';

describe('SubstackService', () => {
  afterEach(() => {
    dnsLookupMock.mockReset();
  });

  it('returns explicit fallback for draft creation', async () => {
    const service = new SubstackService(
      { post: vi.fn() } as never,
      { error: vi.fn() } as never,
    );

    const result = await service.createDraft({
      markdown: '# Draft',
      title: 'Title',
    });

    expect(result.pushed).toBe(false);
    expect(result.reason).toBe('no_public_write_api');
  });

  it('skips webhook delivery when url is missing', async () => {
    const service = new SubstackService(
      { post: vi.fn() } as never,
      { error: vi.fn() } as never,
    );

    const result = await service.deliverDraftWebhook({
      payload: { event: 'newsletter.draft.ready' },
    });

    expect(result.status).toBe('skipped');
  });

  it('delivers webhook when url is valid', async () => {
    // Stub DNS lookup to resolve to a public address so no real DNS call is made.
    dnsLookupMock.mockResolvedValue({
      address: '93.184.216.34',
      family: 4,
      hostname: '',
    });

    const post = vi.fn().mockReturnValue(of({ status: 202 }));
    const service = new SubstackService(
      { post } as never,
      { error: vi.fn() } as never,
    );

    const result = await service.deliverDraftWebhook({
      payload: { event: 'newsletter.draft.ready' },
      webhookSecret: 'secret',
      webhookUrl: 'https://hooks.example.com/substack',
    });

    expect(result.status).toBe('delivered');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('throws BadRequestException for http:// webhook urls', async () => {
    const service = new SubstackService(
      { post: vi.fn() } as never,
      { error: vi.fn() } as never,
    );

    await expect(
      service.deliverDraftWebhook({
        payload: { event: 'newsletter.draft.ready' },
        webhookUrl: 'http://hooks.example.com/hook',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws BadRequestException for private IPv4 webhook urls', async () => {
    const service = new SubstackService(
      { post: vi.fn() } as never,
      { error: vi.fn() } as never,
    );

    await expect(
      service.deliverDraftWebhook({
        payload: { event: 'newsletter.draft.ready' },
        webhookUrl: 'https://127.0.0.1:3000/hook',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws BadRequestException for AWS metadata endpoint 169.254.169.254', async () => {
    const service = new SubstackService(
      { post: vi.fn() } as never,
      { error: vi.fn() } as never,
    );

    await expect(
      service.deliverDraftWebhook({
        payload: { event: 'newsletter.draft.ready' },
        webhookUrl: 'https://169.254.169.254/latest/meta-data/',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws BadRequestException when Authorization header is supplied', async () => {
    dnsLookupMock.mockResolvedValue({
      address: '93.184.216.34',
      family: 4,
      hostname: '',
    });

    const service = new SubstackService(
      { post: vi.fn() } as never,
      { error: vi.fn() } as never,
    );

    await expect(
      service.deliverDraftWebhook({
        payload: { event: 'newsletter.draft.ready' },
        webhookHeaders: { Authorization: 'Bearer token' },
        webhookUrl: 'https://hooks.example.com/hook',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws BadRequestException for header value with CRLF injection', async () => {
    dnsLookupMock.mockResolvedValue({
      address: '93.184.216.34',
      family: 4,
      hostname: '',
    });

    const service = new SubstackService(
      { post: vi.fn() } as never,
      { error: vi.fn() } as never,
    );

    await expect(
      service.deliverDraftWebhook({
        payload: { event: 'newsletter.draft.ready' },
        webhookHeaders: { 'X-Custom': 'value\r\nX-Injected: evil' },
        webhookUrl: 'https://hooks.example.com/hook',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
