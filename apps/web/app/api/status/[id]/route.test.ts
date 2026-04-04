import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

// Mock dependencies
vi.mock('@/lib/replicate/client', () => ({
  getPredictionStatus: vi.fn(),
}));

vi.mock('@/lib/replicate/webhook-store', () => ({
  getWebhookResult: vi.fn(),
}));

import { getPredictionStatus } from '@/lib/replicate/client';
import { getWebhookResult } from '@/lib/replicate/webhook-store';

describe('GET /api/status/[id]', () => {
  const mockPredictionId = 'pred-123';
  const mockedGetPredictionStatus = vi.mocked(getPredictionStatus);
  const mockedGetWebhookResult = vi.mocked(getWebhookResult);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return webhook result if available', async () => {
    mockedGetWebhookResult.mockReturnValue({
      completedAt: new Date().toISOString(),
      error: undefined,
      output: ['https://example.com/image.png'],
      status: 'succeeded',
    });

    const request = new NextRequest(`http://localhost/api/status/${mockPredictionId}`);
    const response = await GET(request, { params: Promise.resolve({ id: mockPredictionId }) });
    const data = await response.json();

    expect(data.status).toBe('succeeded');
    expect(data.output).toEqual(['https://example.com/image.png']);
    expect(getPredictionStatus).not.toHaveBeenCalled();
  });

  it('should fall back to Replicate API when no webhook result', async () => {
    mockedGetWebhookResult.mockReturnValue(undefined);
    mockedGetPredictionStatus.mockResolvedValue({
      error: undefined,
      id: mockPredictionId,
      metrics: { predict_time: 5.2 },
      output: ['https://api.com/output.png'],
      status: 'succeeded',
    });

    const request = new NextRequest(`http://localhost/api/status/${mockPredictionId}`);
    const response = await GET(request, { params: Promise.resolve({ id: mockPredictionId }) });
    const data = await response.json();

    expect(data.status).toBe('succeeded');
    expect(data.output).toEqual(['https://api.com/output.png']);
    expect(mockedGetPredictionStatus).toHaveBeenCalledWith(mockPredictionId);
  });

  it('should return processing status with progress', async () => {
    mockedGetWebhookResult.mockReturnValue(undefined);
    mockedGetPredictionStatus.mockResolvedValue({
      error: undefined,
      id: mockPredictionId,
      metrics: undefined,
      output: undefined,
      status: 'processing',
    });

    const request = new NextRequest(`http://localhost/api/status/${mockPredictionId}`);
    const response = await GET(request, { params: Promise.resolve({ id: mockPredictionId }) });
    const data = await response.json();

    expect(data.status).toBe('processing');
    expect(data.progress).toBe(50);
  });

  it('should return failed status with error', async () => {
    mockedGetWebhookResult.mockReturnValue({
      completedAt: new Date().toISOString(),
      error: 'Model failed to generate output',
      output: undefined,
      status: 'failed',
    });

    const request = new NextRequest(`http://localhost/api/status/${mockPredictionId}`);
    const response = await GET(request, { params: Promise.resolve({ id: mockPredictionId }) });
    const data = await response.json();

    expect(data.status).toBe('failed');
    expect(data.error).toBe('Model failed to generate output');
  });

  it('should handle API errors', async () => {
    mockedGetWebhookResult.mockReturnValue(undefined);
    mockedGetPredictionStatus.mockRejectedValue(new Error('Network error'));

    const request = new NextRequest(`http://localhost/api/status/${mockPredictionId}`);
    const response = await GET(request, { params: Promise.resolve({ id: mockPredictionId }) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to check status');
  });
});
