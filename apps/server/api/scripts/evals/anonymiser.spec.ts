import { describe, expect, it } from 'vitest';
import {
  anonymiseText,
  findResidualIdentifiers,
  prepareTerms,
} from './anonymiser';
import type { AnonymisationContext } from './golden-set.types';

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
    ['I4', 'id cq7m2x9v4k8n3p6r1t5w0y2z4', 'id [id]'],
    ['I5', 'uuid 3f2b8c1e-9a4d-4e6f-8b2a-1c5d7e9f0a3b', 'uuid [id]'],
    ['I6', 'oid 64b7f2c9e1a3d5f7b9c1e3a5', 'oid [id]'],
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
