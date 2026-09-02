import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import { PostingSignaturesService } from '@services/content/posting-signatures.service';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/base.service', () => ({
  BaseService: class MockBaseService {
    public endpoint: string;

    constructor(endpoint: string) {
      this.endpoint = endpoint;
    }

    static getDataServiceInstance<T>(
      ServiceClass: new (token: string) => T,
      token: string,
    ): T {
      return new ServiceClass(token);
    }
  },
}));

describe('PostingSignaturesService', () => {
  it('uses the posting-signatures API endpoint', () => {
    const service = new PostingSignaturesService('token');
    expect(service).toBeInstanceOf(PostingSignaturesService);
    expect(API_ENDPOINTS.POSTING_SIGNATURES).toBe('/posting-signatures');
  });
});
