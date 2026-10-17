import {
  axiosResponse,
  installMockHttp,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { BrandedGenerationReceiptsService } from '@services/ai/branded-generation-receipts.service';
import { describe, expect, it } from 'vitest';

function setup() {
  const service = new BrandedGenerationReceiptsService('test-token');
  return { http: installMockHttp(service), service };
}
const feedback = {
  id: 'receipt-1',
  implicit: {
    isDiscarded: false,
    isEdited: false,
    postStatus: 'draft',
    reviewDecision: null,
  },
  ratedAt: '2026-10-17T10:00:00.000Z',
  rating: 'down' as const,
  reasons: ['off_voice' as const],
  receiptId: 'receipt-1',
};
const document = (value = feedback) =>
  axiosResponse(
    resourceDocument(value, {
      id: value.id,
      type: 'branded-generation-feedback',
    }),
  );

describe('generation feedback HTTP client', () => {
  it('reads the own rating from the encoded feedback route', async () => {
    const { http, service } = setup();
    const signal = new AbortController().signal;
    http.get.mockResolvedValueOnce(document());
    expect(await service.getFeedback('brand /?', 'receipt-1', signal)).toEqual(
      feedback,
    );
    expect(http.get).toHaveBeenCalledWith(
      'brand%20%2F%3F/generation-receipts/receipt-1/feedback',
      { signal },
    );
  });

  it('puts the rating and reasons and validates the answer', async () => {
    const { http, service } = setup();
    http.put.mockResolvedValueOnce(document());
    const input = { rating: 'down' as const, reasons: ['off_voice' as const] };
    expect(await service.rateFeedback('brand', 'receipt-1', input)).toEqual(
      feedback,
    );
    expect(http.put).toHaveBeenCalledWith(
      'brand/generation-receipts/receipt-1/feedback',
      input,
      { signal: undefined },
    );
  });

  it('rejects an answer for another receipt or with the wrong type', async () => {
    const { http, service } = setup();
    http.get.mockResolvedValueOnce(
      document({ ...feedback, id: 'other', receiptId: 'other' }),
    );
    await expect(service.getFeedback('brand', 'receipt-1')).rejects.toThrow(
      'receipt_response_invalid',
    );
    http.get.mockResolvedValueOnce(
      axiosResponse(resourceDocument(feedback, { id: 'receipt-1', type: 'x' })),
    );
    await expect(service.getFeedback('brand', 'receipt-1')).rejects.toThrow(
      'receipt_response_invalid',
    );
    http.get.mockResolvedValueOnce(
      document({ ...feedback, rating: 'sideways' as never }),
    );
    await expect(service.getFeedback('brand', 'receipt-1')).rejects.toThrow(
      'receipt_response_invalid',
    );
  });

  it('withdraws the rating', async () => {
    const { http, service } = setup();
    http.delete.mockResolvedValueOnce(axiosResponse(undefined));
    await service.withdrawFeedback('brand', 'receipt-1');
    expect(http.delete).toHaveBeenCalledWith(
      'brand/generation-receipts/receipt-1/feedback',
      { signal: undefined },
    );
  });

  it('reads the brand summary', async () => {
    const { http, service } = setup();
    const summary = {
      byMode: [{ down: 1, mode: 'raw', up: 2 }],
      down: 1,
      id: 'brand',
      reasons: [
        { count: 1, reason: 'off_voice' },
        { count: 0, reason: 'wrong_facts' },
        { count: 0, reason: 'too_long' },
        { count: 0, reason: 'too_generic' },
        { count: 0, reason: 'other' },
      ],
      up: 2,
      windowDays: 30,
    };
    http.get.mockResolvedValueOnce(
      axiosResponse(
        resourceDocument(summary, {
          id: 'brand',
          type: 'branded-generation-feedback-summary',
        }),
      ),
    );
    expect(await service.getFeedbackSummary('brand')).toEqual(summary);
    expect(http.get).toHaveBeenCalledWith('brand/generation-feedback/summary', {
      signal: undefined,
    });
  });
});
