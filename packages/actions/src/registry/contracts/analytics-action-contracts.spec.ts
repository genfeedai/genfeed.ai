import { describe, expect, it } from 'vitest';
import { getAnalyticsActionContract } from './analytics-action-contracts';

describe('analytics collection action contracts', () => {
  it.each(['facebook', 'social', 'threads', 'twitter', 'youtube'])(
    'exposes deferred refresh and actual resolved account for %s',
    (platform) => {
      const contract = getAnalyticsActionContract(
        `analytics.${platform}.collect`,
      );
      expect(contract?.inputSchema).toMatchObject({
        properties: { deferOutlierRefresh: { type: 'boolean' } },
        required: ['item'],
      });
      expect(contract?.outputSchema).toMatchObject({
        properties: {
          outlierAccount: {
            required: ['organizationId', 'brandId', 'credentialId'],
            additionalProperties: false,
          },
        },
        required: ['attempted', 'batches', 'outlierAccount'],
      });
    },
  );
  it('supports both durable awaited results and legacy scheduled results', () => {
    const contract = getAnalyticsActionContract(
      'analytics.collection.finalize',
    );
    expect(contract?.inputSchema).toMatchObject({
      properties: {
        collection: {
          anyOf: [
            expect.objectContaining({ required: ['count', 'results'] }),
            expect.objectContaining({ required: ['count', 'results'] }),
          ],
        },
      },
    });
    expect(contract?.outputSchema).toMatchObject({
      properties: {
        status: { enum: ['completed', 'completed_with_errors'] },
        failed: { type: 'integer' },
      },
    });
  });
});
