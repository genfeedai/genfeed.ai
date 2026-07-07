import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const conversionMocks = vi.hoisted(() => ({
  parseServerConversionRequest: vi.fn(),
  sendServerConversions: vi.fn(),
}));

vi.mock('../../../../packages/marketing/server-conversions', () => ({
  parseServerConversionRequest: conversionMocks.parseServerConversionRequest,
  sendServerConversions: conversionMocks.sendServerConversions,
}));

describe('marketing conversion route', () => {
  beforeEach(() => {
    conversionMocks.parseServerConversionRequest.mockReset();
    conversionMocks.sendServerConversions.mockReset();
  });

  it('rejects conversion requests without same-site provenance', async () => {
    const response = await POST(
      new NextRequest('https://genfeed.ai/api/marketing/conversions', {
        body: JSON.stringify({ eventId: 'book_call:1', name: 'book_call' }),
        method: 'POST',
      }),
    );

    expect(response.status).toBe(403);
    expect(conversionMocks.sendServerConversions).not.toHaveBeenCalled();
  });

  it('dispatches parsed same-site conversion requests with request context', async () => {
    const event = {
      eventId: 'book_call:1',
      name: 'book_call',
      payload: { source: 'pricing' },
      url: 'https://genfeed.ai/pricing',
    };

    conversionMocks.parseServerConversionRequest.mockReturnValue(event);
    conversionMocks.sendServerConversions.mockResolvedValue({
      linkedin: 'skipped',
      meta: 'configured',
      x: 'skipped',
    });

    const response = await POST(
      new NextRequest('https://genfeed.ai/api/marketing/conversions', {
        body: JSON.stringify(event),
        headers: {
          origin: 'https://genfeed.ai',
          'user-agent': 'vitest',
          'x-forwarded-for': '203.0.113.10, 198.51.100.2',
        },
        method: 'POST',
      }),
    );

    await expect(response.json()).resolves.toEqual({
      ok: true,
      result: {
        linkedin: 'skipped',
        meta: 'configured',
        x: 'skipped',
      },
    });
    expect(response.status).toBe(200);
    expect(conversionMocks.parseServerConversionRequest).toHaveBeenCalledWith(
      event,
    );
    expect(conversionMocks.sendServerConversions).toHaveBeenCalledWith(event, {
      clientIp: '203.0.113.10',
      userAgent: 'vitest',
    });
  });
});
