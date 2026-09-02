import { describe, expect, it } from 'vitest';
import { RESEARCH_FINDING_REFERENCE_KINDS } from './research-finding-reference.interface';

describe('research finding reference contract', () => {
  it('distinguishes public and connected TikTok ads from Google ads', () => {
    expect(RESEARCH_FINDING_REFERENCE_KINDS).toContain(
      'research-ad-connected-tiktok',
    );
    expect(RESEARCH_FINDING_REFERENCE_KINDS).toContain(
      'research-ad-public-tiktok',
    );
  });
});
