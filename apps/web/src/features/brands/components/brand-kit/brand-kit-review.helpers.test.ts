import type {
  IBrandKitApplyResult,
  IBrandKitDraftField,
} from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import {
  canApplyField,
  formatBrandKitValue,
  formatConfidence,
  getDiagnostics,
  getFieldEvidenceKind,
  hasMeaningfulBrandKitValue,
  nextAppliedField,
  parseEditableValue,
  parseSocialUrls,
  readApplyValue,
  readSocialProposals,
  showsScoredKind,
} from './brand-kit-review.helpers';

function field(proposedValue: unknown): IBrandKitDraftField {
  return {
    applyActionDefault: 'preserve',
    currentValue: 'Before',
    diagnostics: [],
    evidence: [],
    group: 'profile',
    key: 'description',
    label: 'Description',
    ownerPath: 'brand.description',
    proposedValue,
  };
}

const applyResult: IBrandKitApplyResult = {
  id: 'apply-fixture',
  appliedFields: ['socialLinks'],
  brandId: 'brand-1',
  diagnostics: [],
  preservedFields: [],
  status: 'partial',
};

describe('brand kit review helpers', () => {
  it('ignores blank proposals and recursively checks real values rather than metadata', () => {
    for (const value of [
      undefined,
      null,
      '  ',
      [],
      {},
      false,
      0,
      { url: ' ', label: 'Image' },
      { platform: 'instagram', url: '' },
    ])
      expect(hasMeaningfulBrandKitValue(value)).toBe(false);
    expect(hasMeaningfulBrandKitValue(['', { nested: ['  ', 'usable'] }])).toBe(
      true,
    );
    expect(
      hasMeaningfulBrandKitValue({
        role: 'logo',
        url: 'https://example.com/logo.png',
      }),
    ).toBe(true);
  });

  it('preserves structured display order and line breaks for list values', () => {
    expect(
      formatBrandKitValue([
        {
          label: 'Logo',
          platform: 'web',
          role: 'logo',
          width: 320,
          height: 200,
          url: 'https://example.com/logo.png',
        },
        'second',
      ]),
    ).toBe('Logo web logo 320x200 https://example.com/logo.png\nsecond');
    expect(formatBrandKitValue(undefined)).toBe('');
    expect(formatBrandKitValue({ unrelated: 'ignored' })).toBe('');
  });

  it('trims scalar edits and splits only list-backed fields and source URLs', () => {
    expect(parseEditableValue('description', '  One, two\nthree  ')).toBe(
      'One, two\nthree',
    );
    expect(parseEditableValue('voiceValues', '  One, two\n, three  ')).toEqual([
      'One',
      'two',
      'three',
    ]);
    expect(
      parseSocialUrls(' https://example.com/a,\n https://example.com/b\n'),
    ).toEqual(['https://example.com/a', 'https://example.com/b']);
  });

  it('keeps structured apply values intact and does not accept deferred or empty fields', () => {
    const links = field([
      { platform: 'instagram', url: 'https://example.com/acme' },
    ]);
    expect(
      readApplyValue('socialLinks', links, { socialLinks: 'changed text' }),
    ).toBe(links.proposedValue);
    expect(
      readApplyValue('description', field('Proposal'), {
        description: '  Edit  ',
      }),
    ).toBe('Edit');
    expect(
      canApplyField(
        'logo',
        field({ role: 'logo', url: 'https://example.com/logo.png' }),
      ),
    ).toBe(true);
    expect(canApplyField('banner', field('banner'))).toBe(false);
    expect(canApplyField('references', field(['reference']))).toBe(false);
    expect(canApplyField('description', field('  '))).toBe(false);
  });

  it('distinguishes unverified color candidates, extracted evidence and inferred values', () => {
    const extracted = {
      ...field('Proposal'),
      confidence: 0.905,
      evidence: [{ label: 'Website', sourceType: 'website' as const }],
    };
    expect(getFieldEvidenceKind('description', extracted)).toBe('extracted');
    expect(getFieldEvidenceKind('primaryColor', extracted)).toBe('candidate');
    expect(getFieldEvidenceKind('description', field('Proposal'))).toBe(
      'inferred',
    );
    expect(getFieldEvidenceKind('description', field(''))).toBe('missing');
    expect(formatConfidence(extracted.confidence)).toBe('Confidence: 91%');
    expect(formatConfidence(0)).toBeNull();
    expect(showsScoredKind('candidate', 1)).toBe(false);
    expect(showsScoredKind('extracted', 0.9)).toBe(true);
  });

  it('only reads social proposals with both a platform and a nonblank URL', () => {
    expect(
      readSocialProposals([
        null,
        'text',
        { platform: 'instagram', url: '  https://example.com/a  ' },
        { platform: '', url: 'https://example.com/b' },
        { platform: 'web', url: ' ' },
      ]),
    ).toEqual([{ platform: 'instagram', url: 'https://example.com/a' }]);
    expect(
      readSocialProposals({
        platform: 'instagram',
        url: 'https://example.com/a',
      }),
    ).toEqual([]);
  });

  it('keeps rejected social links pending after partial acceptance and clears ordinary proposals', () => {
    const accepted = { platform: 'INSTAGRAM', url: 'https://example.com/a' };
    const rejected = {
      platform: 'linkedin',
      url: 'https://example.com/b',
      sourceType: 'website',
    };
    const sent = [accepted, rejected];
    const result = {
      ...applyResult,
      appliedValues: {
        socialLinks: [
          { platform: ' instagram ', url: ' https://example.com/a ' },
        ],
      },
    };
    const next = nextAppliedField('socialLinks', field(sent), sent, result);
    expect(next?.proposedValue).toEqual([rejected]);
    expect(next?.currentValue).toEqual(result.appliedValues.socialLinks);
    expect(sent).toEqual([accepted, rejected]);
    expect(
      nextAppliedField('socialLinks', field(sent), sent, applyResult),
    ).toBeUndefined();
    expect(
      nextAppliedField('description', field('Proposal'), 'Edited', applyResult),
    ).toMatchObject({ currentValue: 'Edited', proposedValue: undefined });
  });

  it('combines apply and import diagnostics in source order without mutation', () => {
    const diagnostic = {
      code: 'apply',
      message: 'Apply result',
      severity: 'info' as const,
    };
    const result = { ...applyResult, diagnostics: [diagnostic] };
    expect(getDiagnostics(null, result, null)).toEqual([diagnostic]);
    expect(result.diagnostics).toEqual([diagnostic]);
    expect(getDiagnostics(null, null, null)).toEqual([]);
  });
});
