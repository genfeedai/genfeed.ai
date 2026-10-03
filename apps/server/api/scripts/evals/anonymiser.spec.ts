import { testId } from '@helpers/testing/test-id.helper';
import { describe, expect, it } from 'vitest';
import {
  anonymiseText,
  buildAnonymisationContext,
  findResidualIdentifiers,
  prepareTerms,
} from './anonymiser';
import type {
  AnonymisationContext,
  GoldenSetScopeSnapshot,
} from './golden-set.types';

const SPEC_CONTEXT: AnonymisationContext = {
  knownIds: [
    'synthetic-org-golden',
    'synthetic-brand-kelder',
    'ckelderpost00000000000001',
  ],
  brandTerms: [
    { term: 'KELDER', brandFixtureId: 'brand-0000000000a1' },
    { term: 'kelder', brandFixtureId: 'brand-0000000000a1' },
    { term: 'KELDER Studio', brandFixtureId: 'brand-0000000000a1' },
    { term: '@kelder_studio', brandFixtureId: 'brand-0000000000a1' },
    { term: 'Tarnfield Outdoor', brandFixtureId: 'brand-0000000000b2' },
    { term: 'tarn-field', brandFixtureId: 'brand-0000000000b2' },
    { term: 'Fjord', brandFixtureId: 'brand-0000000000a1' },
    { term: 'fjord', brandFixtureId: 'brand-0000000000b2' },
  ],
  organizationTerms: [
    'Golden Synthetic Studio',
    'golden-synthetic-studio',
    'Kelder Group',
    'kelder',
  ],
  personTerms: ['Mara', 'Lindqvist', 'Mara Lindqvist', 'Tobias Venn', 'Bo'],
};

describe('prepareTerms', () => {
  it('PT-1: prepares terms in the exact deterministic order', () => {
    expect(
      prepareTerms(SPEC_CONTEXT).map((term) => [term.term, term.token]),
    ).toEqual([
      ['golden synthetic studio', '[organization]'],
      ['golden-synthetic-studio', '[organization]'],
      ['tarnfield outdoor', 'brand-0000000000b2'],
      ['mara lindqvist', '[person]'],
      ['kelder studio', 'brand-0000000000a1'],
      ['kelder_studio', 'brand-0000000000a1'],
      ['kelder group', '[organization]'],
      ['tobias venn', '[person]'],
      ['tarn field', 'brand-0000000000b2'],
      ['tarn-field', 'brand-0000000000b2'],
      ['lindqvist', '[person]'],
      ['kelder', 'brand-0000000000a1'],
      ['fjord', '[organization]'],
      ['mara', '[person]'],
    ]);
  });
});

describe('handles', () => {
  it.each([
    ['H1', '@kelder_studio launches today', '[handle] launches today'],
    ['H2', 'New pans from @kelder_studio.', 'New pans from [handle].'],
    ['H3', 'Tag kelder_studio in stories', 'Tag brand-0000000000a1 in stories'],
  ])('%s: anonymises %s', (_caseId, input, expected) => {
    expect(anonymiseText(input, SPEC_CONTEXT)).toBe(expected);
  });
});

describe('emails', () => {
  it.each([
    [
      'E1',
      'Write to mara.lindqvist@kelder.example today',
      'Write to [email] today',
    ],
    ['E2', 'Contact hello@kelder.example.', 'Contact [email].'],
  ])('%s: anonymises %s', (_caseId, input, expected) => {
    expect(anonymiseText(input, SPEC_CONTEXT)).toBe(expected);
  });
});

describe('urls', () => {
  it.each([
    ['U1', 'Read https://kelder.example/journal.', 'Read [url].'],
    ['U2', 'See www.kelder.example/pans!', 'See [url]!'],
    ['U3', 'Shop kelder.example/path, today', 'Shop [url], today'],
    [
      'U4',
      'Open https://app.example/p/ckelderpost00000000000001 now',
      'Open [url] now',
    ],
  ])('%s: anonymises %s', (_caseId, input, expected) => {
    expect(anonymiseText(input, SPEC_CONTEXT)).toBe(expected);
  });
});

describe('brand names', () => {
  it.each([
    ['B1', 'KELDER pans', 'brand-0000000000a1 pans'],
    ['B2', 'the kelder range', 'the brand-0000000000a1 range'],
    ['B3', 'Hiking with Tarn Field', 'Hiking with brand-0000000000b2'],
    ['B4', 'tarn-field boots', 'brand-0000000000b2 boots'],
    ['B5', 'KELDER Studio pans', 'brand-0000000000a1 pans'],
    ['B6', 'kelderish', 'kelderish'],
    ['B7', 'Fjord kettle', '[organization] kettle'],
  ])('%s: anonymises %s', (_caseId, input, expected) => {
    expect(anonymiseText(input, SPEC_CONTEXT)).toBe(expected);
  });
});

describe('organization names', () => {
  it.each([
    ['O1', 'Golden Synthetic Studio ships', '[organization] ships'],
    ['O2', 'golden-synthetic-studio', '[organization]'],
    [
      'O3',
      'Kelder Group owns KELDER',
      '[organization] owns brand-0000000000a1',
    ],
  ])('%s: anonymises %s', (_caseId, input, expected) => {
    expect(anonymiseText(input, SPEC_CONTEXT)).toBe(expected);
  });
});

describe('person names', () => {
  it.each([
    ['P1', 'Mara wrote this', '[person] wrote this'],
    ['P2', 'Thanks Lindqvist', 'Thanks [person]'],
    ['P3', 'Mara Lindqvist approved', '[person] approved'],
    ['P4', 'Dr. Mara Lindqvist approved', '[person] approved'],
    ['P5', 'Prof. Ingrid Solberg agrees', '[person] agrees'],
    ['P6', 'Marathon training', 'Marathon training'],
    ['P7', 'Bo said yes', 'Bo said yes'],
  ])('%s: anonymises %s', (_caseId, input, expected) => {
    expect(anonymiseText(input, SPEC_CONTEXT)).toBe(expected);
  });
});

describe('org/brand ids', () => {
  it.each([
    ['I1', 'org synthetic-org-golden', 'org [id]'],
    ['I2', 'ref synthetic-brand-kelder', 'ref [id]'],
    ['I3', 'post ckelderpost00000000000001', 'post [id]'],
    ['I4', `id ${testId('unknown-cuid')}`, 'id [id]'],
    ['I5', 'uuid 3f2b8c1e-9a4d-4e6f-8b2a-1c5d7e9f0a3b', 'uuid [id]'],
    ['I6', `oid ${'0'.repeat(20)}beef`, 'oid [id]'],
  ])('%s: anonymises %s', (_caseId, input, expected) => {
    expect(anonymiseText(input, SPEC_CONTEXT)).toBe(expected);
  });
});

const R1_RAW =
  'Mail mara@kelder.example, see https://kelder.example, ping @kelder_studio, KELDER by Golden Synthetic Studio, Mara Lindqvist, ref ckelderpost00000000000001';

describe('residual detector', () => {
  it('R1: detects every raw identifier category', () => {
    expect(findResidualIdentifiers(R1_RAW, SPEC_CONTEXT)).toEqual([
      'brand',
      'email',
      'handle',
      'id',
      'organization',
      'person',
      'url',
    ]);
  });

  it('R2: anonymises raw identifiers and leaves no residual identifiers', () => {
    const output = anonymiseText(R1_RAW, SPEC_CONTEXT);
    expect(output).toBe(
      'Mail [email], see [url], ping [handle], brand-0000000000a1 by [organization], [person], ref [id]',
    );
    expect(findResidualIdentifiers(output, SPEC_CONTEXT)).toEqual([]);
  });

  it('R3: ignores emitted tokens', () => {
    expect(
      findResidualIdentifiers('brand-0000000000a1 [person]', SPEC_CONTEXT),
    ).toEqual([]);
  });
});

describe('buildAnonymisationContext', () => {
  const snapshot: GoldenSetScopeSnapshot = {
    scope: { organizationId: 'synthetic-org-golden', brandIds: [] },
    organization: {
      id: 'synthetic-org-golden',
      label: 'Golden Synthetic Studio',
      slug: 'golden-synthetic-studio',
    },
    brands: [{ id: 'synthetic-brand-kelder', label: 'KELDER', slug: 'kelder' }],
    credentials: [
      {
        brandId: null,
        externalHandle: '@golden_studio',
        externalName: null,
        username: null,
      },
      {
        brandId: 'synthetic-brand-kelder',
        externalHandle: '@kelder_studio',
        externalName: null,
        username: null,
      },
    ],
    members: [
      {
        user: {
          firstName: 'Mara',
          lastName: 'Lindqvist',
          name: null,
          handle: 'mara_lindqvist',
        },
      },
    ],
    posts: [],
    batchItems: [],
    evaluations: [],
    newsletters: [],
    profiles: [
      {
        id: 'synthetic-profile-golden',
        organizationId: 'synthetic-org-golden',
        isDeleted: false,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        data: {},
      },
    ],
    contextBases: [],
    contextEntries: [],
    linkedPosts: [],
    linkedArticles: [],
    linkedNewsletters: [],
    linkedBatchItems: [],
    threadChildren: [],
  };
  const context = buildAnonymisationContext(
    snapshot,
    new Map([['synthetic-brand-kelder', 'brand-0000000000a1']]),
  );

  it('puts credentials without a brand in organizationTerms', () => {
    expect(context.organizationTerms).toContain('@golden_studio');
    expect(context.brandTerms.map(({ term }) => term)).not.toContain(
      '@golden_studio',
    );
  });

  it('preserves a brand credential handle with its brand fixture id', () => {
    expect(context.brandTerms).toContainEqual({
      term: '@kelder_studio',
      brandFixtureId: 'brand-0000000000a1',
    });
    expect(context.organizationTerms).not.toContain('@kelder_studio');
  });

  it('joins member firstName and lastName in personTerms', () => {
    expect(context.personTerms).toContain('Mara Lindqvist');
  });

  it('includes organization, brand and record ids in knownIds', () => {
    expect(context.knownIds).toEqual(
      expect.arrayContaining([
        'synthetic-org-golden',
        'synthetic-brand-kelder',
        'synthetic-profile-golden',
      ]),
    );
  });
});
