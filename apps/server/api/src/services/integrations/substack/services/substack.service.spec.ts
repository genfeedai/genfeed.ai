import {
  isAllowedWebhookUrl,
  SubstackService,
} from '@api/services/integrations/substack/services/substack.service';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

describe('SubstackService', () => {
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

  it('blocks localhost webhook urls', () => {
    expect(isAllowedWebhookUrl('http://localhost:3000/hook')).toBe(false);
    expect(isAllowedWebhookUrl('http://127.0.0.1:8080/hook')).toBe(false);
    expect(isAllowedWebhookUrl('https://hooks.example.com/hook')).toBe(true);
  });
});
