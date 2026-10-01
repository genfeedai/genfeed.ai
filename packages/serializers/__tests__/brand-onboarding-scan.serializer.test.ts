import { BrandOnboardingScanSerializer } from '@serializers/server/organizations/brand-onboarding-scan.serializer';
import { describe, expect, it } from 'vitest';

describe('Brand onboarding scan transport', () => {
  it('serializes absence as null', () => {
    expect(BrandOnboardingScanSerializer.serialize(null)).toEqual({
      data: null,
    });
  });
  it.each(['pending', 'running', 'ready', 'partial', 'failed'] as const)(
    'serializes %s without private configuration',
    (status) => {
      const terminal = ['ready', 'partial', 'failed'].includes(status);
      const scan = {
        id: 'request-1',
        brandId: 'brand-1',
        status,
        url: 'https://acme.test/',
        startedAt: '2026-10-01T10:00:00.000Z',
        ...(terminal ? { completedAt: '2026-10-01T10:01:00.000Z' } : {}),
        ...(['ready', 'partial'].includes(status)
          ? { revisionId: 'revision-1' }
          : {}),
        ...(status === 'failed' ? { errorCode: 'scan_failed' } : {}),
      };
      const output = BrandOnboardingScanSerializer.serialize({
        ...scan,
        organizationId: 'PRIVATE_ORG',
        actorId: 'PRIVATE_ACTOR',
        agentConfig: { prompt: 'PRIVATE_PROMPT' },
        headers: { authorization: 'PRIVATE_AUTH' },
        stack: 'PRIVATE_STACK',
      });
      const { id, ...attributes } = scan;
      expect(output).toEqual({
        data: { id, type: 'brand-onboarding-scan', attributes },
      });
      expect(JSON.stringify(output)).not.toContain('PRIVATE_');
    },
  );
});
