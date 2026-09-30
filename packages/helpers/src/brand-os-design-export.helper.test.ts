import type { IBrandOsDesignExportInput } from '@genfeedai/contracts/interfaces';
import {
  buildBrandOsDesignExport,
  safeBrandOsSourceUrl,
} from '@helpers/brand-os-design-export.helper';
import { describe, expect, it } from 'vitest';

function input(): IBrandOsDesignExportInput {
  return {
    approvedAt: '2026-09-14T12:00:00.000Z',
    brandId: 'brand-1',
    revisionId: 'revision-1',
    visibility: 'private',
    content: {
      fields: {
        label: {
          currentValue: 'Example Brand',
          evidence: [
            { sourceType: 'website', url: 'https://example.com/about' },
          ],
        },
        description: {
          currentValue: 'Useful products for creators',
          evidence: [{ sourceType: 'system' }],
        },
        voiceTone: {
          currentValue: 'Direct',
          evidence: [{ sourceType: 'manual' }],
        },
        primaryColor: {
          currentValue: '#336699',
          evidence: [{ sourceType: 'current_brand' }],
        },
        voiceAudience: { currentValue: ['Creators', 'Founders'], evidence: [] },
        logo: {
          currentValue: {
            sourceType: 'website',
            url: 'https://example.com/logo.png',
          },
          evidence: [{ sourceType: 'manual' }],
        },
      },
    },
  };
}

describe('approved design.md contract', () => {
  it('produces byte-stable versioned output and SHA256 digest', () => {
    const first = buildBrandOsDesignExport(input());
    expect(buildBrandOsDesignExport(input())).toEqual(first);
    expect(first.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(first.markdown).toContain(
      'Revision: revision-1\nGenerated at: 2026-09-14T12:00:00.000Z',
    );
    expect(first.markdown).toContain('label [extracted]: Example Brand');
    expect(first.markdown).toContain(
      'description [inferred]: Useful products for creators',
    );
    expect(first.markdown).toContain('voiceTone [accepted-candidate]: Direct');
    expect(first.markdown).toContain('fontFamily [missing]: Not provided');
    expect(first.markdown).toContain('<https://example.com/about>');
  });
  it('supports a minimal approved identity without inventing missing guidance', () => {
    const artifact = buildBrandOsDesignExport({
      ...input(),
      content: { fields: { label: { currentValue: 'Partial' } } },
    });
    expect(artifact.markdown).toContain('description [missing]: Not provided');
  });
  it.each([
    null,
    {},
    { fields: {} },
    { fields: { label: { proposedValue: 'unapproved' } } },
    { fields: { label: { currentValue: {} } } },
    {
      fields: {
        label: { currentValue: 'Approved' },
        voiceTone: { currentValue: 123 },
      },
    },
  ])('fails closed for malformed approved content: %j', (content) => {
    expect(() => buildBrandOsDesignExport({ ...input(), content })).toThrow(
      'Approved Brand OS cannot be exported',
    );
  });
  it('rejects oversized guidance without truncating approved rules', () => {
    expect(() =>
      buildBrandOsDesignExport({
        ...input(),
        content: { fields: { label: { currentValue: 'x'.repeat(8_001) } } },
      }),
    ).toThrow();
  });
  it('normalizes unicode and line endings and neutralizes Markdown injection', () => {
    const artifact = buildBrandOsDesignExport({
      ...input(),
      content: {
        fields: {
          label: { currentValue: 'Cafe\u0301\r\n# injected <script>' },
        },
      },
    });
    expect(artifact.markdown).toContain('Café\n  \\# injected \\<script\\>');
    expect(artifact.markdown).not.toContain('\n# injected');
  });
  it.each(['private', 'public'] as const)(
    'excludes every privacy sentinel in %s visibility',
    (visibility) => {
      const sentinels = [
        'CREDENTIAL_SENTINEL',
        'RAW_CAPTURE_SENTINEL',
        'PRIVATE_PROMPT_SENTINEL',
        'DIAGNOSTIC_SENTINEL',
        'MEMBERSHIP_SENTINEL',
        'REJECTED_CANDIDATE_SENTINEL',
        'PROPOSAL_SENTINEL',
        'EXCERPT_SENTINEL',
      ];
      const artifact = buildBrandOsDesignExport({
        ...input(),
        visibility,
        content: {
          credentials: sentinels[0],
          rawSource: sentinels[1],
          diagnostics: [sentinels[3]],
          members: [sentinels[4]],
          assetCandidates: [{ url: sentinels[5] }],
          fields: {
            label: {
              currentValue: 'Approved',
              proposedValue: sentinels[6],
              evidence: [{ sourceType: 'website', excerpt: sentinels[7] }],
            },
            promptGuidelines: { currentValue: sentinels[2] },
            unknown: { currentValue: sentinels[0] },
          },
        },
      });
      for (const sentinel of sentinels)
        expect(artifact.markdown).not.toContain(sentinel);
    },
  );
  it.each([
    'https://localhost/secret',
    'https://127.0.0.1/',
    'https://10.0.0.1/',
    'https://[::1]/',
    'https://foo.internal/',
    'https://example.com/?token=secret',
    'https://example.com/#private',
    'http://example.com/',
    'file:///etc/passwd',
    'https://example.com/private/key',
    'https://example.com:8443/',
  ])('omits unsafe source %s', (url) => {
    expect(safeBrandOsSourceUrl(url, 'website')).toBeUndefined();
  });
  it('omits URLs with embedded credentials', () => {
    const url = new URL('https://example.com/');
    url.username = 'fixture-user';
    url.password = 'fixture-password';
    expect(safeBrandOsSourceUrl(url.href, 'website')).toBeUndefined();
  });
  it('defaults unknown/private evidence visibility to omission', () => {
    expect(
      safeBrandOsSourceUrl('https://example.com/public', undefined),
    ).toBeUndefined();
    expect(
      safeBrandOsSourceUrl('https://example.com/public', 'uploaded_guidance'),
    ).toBeUndefined();
    expect(safeBrandOsSourceUrl('https://example.com/public', 'website')).toBe(
      'https://example.com/public',
    );
  });
});
