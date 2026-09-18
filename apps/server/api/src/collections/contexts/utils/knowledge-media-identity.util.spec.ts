import {
  KnowledgeMemoryScope,
  KnowledgeSourceKind,
} from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import {
  buildKnowledgeMediaReferenceKey,
  normalizeKnowledgeMediaUrl,
} from './knowledge-media-identity.util';

describe('knowledge media identity', () => {
  it('drops fragments and default ports', () => {
    expect(
      normalizeKnowledgeMediaUrl('https://CDN.Example.com:443/ep.mp3#t=1'),
    ).toBe('https://cdn.example.com/ep.mp3');
  });

  it('keeps distinct brands and query strings apart', () => {
    const left = buildKnowledgeMediaReferenceKey({
      brandId: 'brand-a',
      kind: KnowledgeSourceKind.AUDIO,
      referenceUrl: 'https://cdn.example.com/ep.mp3?token=1',
      scope: KnowledgeMemoryScope.BRAND,
      userId: 'user-1',
    });
    const right = buildKnowledgeMediaReferenceKey({
      brandId: 'brand-b',
      kind: KnowledgeSourceKind.AUDIO,
      referenceUrl: 'https://cdn.example.com/ep.mp3?token=1',
      scope: KnowledgeMemoryScope.BRAND,
      userId: 'user-1',
    });
    expect(left).not.toBe(right);
    expect(left.startsWith('sha256:')).toBe(true);
  });
});
