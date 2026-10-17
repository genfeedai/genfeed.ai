import { describe, expect, it } from 'vitest';
import {
  brandOfferingSubjectLock,
  classifyBrandOffering,
  lockMediaUserPrompt,
  scoreBrandOfferingPrompt,
} from './brand-offering.helper';

describe('classifyBrandOffering', () => {
  it('treats a recruiting platform as software, not a physical product', () => {
    expect(
      classifyBrandOffering(
        'A recruiting software platform with an ATS and CRM for candidates.',
      ),
    ).toBe('software');
  });

  it('does not treat the word product alone as a physical object', () => {
    expect(classifyBrandOffering('Open on the product.')).toBe('unknown');
  });

  it('lets software language win over a mentioned bottle', () => {
    expect(
      classifyBrandOffering(
        'Hiring platform for recruiters. A bottle sits on the desk.',
      ),
    ).toBe('software');
  });

  it('keeps a bottle brand physical when it also mentions an app', () => {
    expect(
      classifyBrandOffering(
        'Insulated steel bottle. Every bottle pairs with a companion app.',
      ),
    ).toBe('physical');
  });

  it('keeps a physical brand physical when it is also hiring', () => {
    expect(
      classifyBrandOffering(
        'Handmade leather shoes and sneakers. We are hiring in Lisbon.',
      ),
    ).toBe('physical');
  });

  it('recognizes a named physical product and a service firm', () => {
    expect(classifyBrandOffering('Matte skincare bottle and packaging.')).toBe(
      'physical',
    );
    expect(classifyBrandOffering('An independent consulting agency.')).toBe(
      'service',
    );
    expect(
      classifyBrandOffering('A recruiting agency for growing teams.'),
    ).toBe('service');
    expect(classifyBrandOffering('Hiring consultancy for executives.')).toBe(
      'service',
    );
  });
});

describe('lockMediaUserPrompt', () => {
  it('puts the software subject lock ahead of the user prompt', () => {
    const locked = lockMediaUserPrompt(
      'Open on the product.',
      'Recruiting software for hiring managers and candidates.',
    );
    expect(locked.startsWith(brandOfferingSubjectLock('software'))).toBe(true);
    expect(locked).toContain('finding the right person');
    expect(locked.endsWith('Open on the product.')).toBe(true);
  });
});

describe('scoreBrandOfferingPrompt', () => {
  it('fails when a software prompt invents earbuds or a bottle', () => {
    const scored = scoreBrandOfferingPrompt({
      kind: 'software',
      output: 'Close-up of wireless earbuds beside a matte bottle.',
      userPrompt: 'Open on the product.',
    });
    expect(scored.isPass).toBe(false);
    expect(scored.violations).toEqual(
      expect.arrayContaining(['earbuds', 'bottle']),
    );
  });

  it('passes a software prompt that shows the person being chosen', () => {
    expect(
      scoreBrandOfferingPrompt({
        kind: 'software',
        output: 'A recruiter smiles when the right candidate accepts the role.',
        userPrompt: 'Short ad for the hiring platform.',
      }).isPass,
    ).toBe(true);
  });

  it('allows a physical product the user already named', () => {
    expect(
      scoreBrandOfferingPrompt({
        kind: 'unknown',
        output: 'Hero shot of the bottle.',
        userPrompt: 'Show the bottle.',
      }).isPass,
    ).toBe(true);
  });
});
