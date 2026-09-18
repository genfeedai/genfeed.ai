import { createHash } from 'node:crypto';
import {
  KnowledgeMemoryScope,
  KnowledgeSourceKind,
} from '@genfeedai/contracts';

export function normalizeKnowledgeMediaUrl(referenceUrl: string): string {
  const url = new URL(referenceUrl);
  url.hash = '';
  if (
    (url.protocol === 'https:' && url.port === '443') ||
    (url.protocol === 'http:' && url.port === '80')
  ) {
    url.port = '';
  }
  url.hostname = url.hostname.toLowerCase();
  return url.toString();
}

export function buildKnowledgeMediaReferenceKey(input: {
  brandId?: string;
  kind: KnowledgeSourceKind;
  referenceUrl: string;
  scope: KnowledgeMemoryScope;
  userId: string;
}): string {
  const scopeIdentity =
    input.scope === KnowledgeMemoryScope.BRAND
      ? (input.brandId ?? '')
      : input.userId;
  const canonical = [
    input.kind,
    input.scope,
    scopeIdentity,
    normalizeKnowledgeMediaUrl(input.referenceUrl),
  ].join('\0');
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}
