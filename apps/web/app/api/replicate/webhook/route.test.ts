import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

// Mock webhook store
vi.mock('@/lib/replicate/webhook-store', () => ({
  setWebhookResult: vi.fn(),
}));

import { setWebhookResult } from '@/lib/replicate/webhook-store';

describe('POST /api/replicate/webhook', () => {
  const mockedSetWebhookResult = vi.mocked(setWebhookResult);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should store successful webhook result', async () => {
    const body = {
      error: null,
      id: 'pred-123',
      output: ['https://example.com/image.png'],
      status: 'succeeded',
    };

    const request = new NextRequest('http://localhost/api/replicate/webhook', {
      body: JSON.stringify(body),
      method: 'POST',
    });

    const response = await POST(request);
    const data = await response.json();

    expect(data.received).toBe(true);
    expect(mockedSetWebhookResult).toHaveBeenCalledWith('pred-123', {
      error: null,
      output: ['https://example.com/image.png'],
      status: 'succeeded',
    });
  });

  it('should store failed webhook result', async () => {
    const body = {
      error: 'Model error: Out of memory',
      id: 'pred-456',
      output: null,
      status: 'failed',
    };

    const request = new NextRequest('http://localhost/api/replicate/webhook', {
      body: JSON.stringify(body),
      method: 'POST',
    });

    const response = await POST(request);
    const data = await response.json();

    expect(data.received).toBe(true);
    expect(mockedSetWebhookResult).toHaveBeenCalledWith('pred-456', {
      error: 'Model error: Out of memory',
      output: null,
      status: 'failed',
    });
  });

  it('should handle processing status', async () => {
    const body = {
      error: null,
      id: 'pred-789',
      output: null,
      status: 'processing',
    };

    const request = new NextRequest('http://localhost/api/replicate/webhook', {
      body: JSON.stringify(body),
      method: 'POST',
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockedSetWebhookResult).toHaveBeenCalledWith('pred-789', {
      error: null,
      output: null,
      status: 'processing',
    });
  });

  it('should handle invalid JSON body', async () => {
    const request = new NextRequest('http://localhost/api/replicate/webhook', {
      body: 'invalid json',
      method: 'POST',
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Webhook processing failed');
  });

  it('should handle missing required fields gracefully', async () => {
    const body = {
      id: 'pred-empty',
      status: 'succeeded',
      // output and error intentionally missing
    };

    const request = new NextRequest('http://localhost/api/replicate/webhook', {
      body: JSON.stringify(body),
      method: 'POST',
    });

    const response = await POST(request);
    const data = await response.json();

    expect(data.received).toBe(true);
    expect(mockedSetWebhookResult).toHaveBeenCalledWith('pred-empty', {
      error: undefined,
      output: undefined,
      status: 'succeeded',
    });
  });
});
