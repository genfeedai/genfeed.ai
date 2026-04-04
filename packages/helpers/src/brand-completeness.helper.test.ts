import { computeBrandCompleteness } from '@helpers/brand-completeness.helper';

function createEmptyBrand() {
  return { id: 'brand-1' };
}

function createFullBrand() {
  return {
    agentConfig: {
      persona: 'A helpful brand manager',
      strategy: {
        contentTypes: ['short_form', 'long_form'],
        frequency: 'daily',
        goals: ['brand awareness'],
        platforms: ['twitter', 'instagram'],
      },
      voice: {
        audience: ['marketers', 'creators'],
        doNotSoundLike: ['robotic'],
        messagingPillars: ['quality', 'speed'],
        sampleOutput: 'Here is a sample post...',
        style: 'authoritative',
        tone: 'professional',
        values: ['innovation', 'trust'],
      },
    },
    description: 'A great brand',
    id: 'brand-1',
    label: 'Acme Corp',
    logo: { id: 'logo-1' },
    primaryColor: '#FF5500',
    references: [{ id: 'ref-1' }],
    text: 'You are the Acme brand assistant.',
  };
}

describe('computeBrandCompleteness', () => {
  it('returns 0% for an empty brand', () => {
    const result = computeBrandCompleteness(createEmptyBrand());

    expect(result.overallScore).toBe(0);
    expect(result.incompleteFields.length).toBeGreaterThan(0);
  });

  it('returns 100% for a fully filled brand', () => {
    const result = computeBrandCompleteness(createFullBrand());

    expect(result.overallScore).toBe(100);
    expect(result.incompleteFields).toHaveLength(0);
  });

  it('computes per-group scores correctly', () => {
    const brand = {
      // logo and text missing → 2/4 identity fields
      agentConfig: {
        voice: {
          tone: 'casual',
          // rest missing → 1/7 voice fields
        },
      },
      description: 'Desc',
      id: 'brand-1',
      label: 'Acme',
    };

    const result = computeBrandCompleteness(brand);

    const identity = result.groups.find((g) => g.key === 'identity');
    expect(identity?.score).toBe(50); // 2 of 4

    const voice = result.groups.find((g) => g.key === 'voice');
    expect(voice?.score).toBe(14); // 1 of 7 → ~14.28 → rounds to 14

    const strategy = result.groups.find((g) => g.key === 'strategy');
    expect(strategy?.score).toBe(0);

    const visual = result.groups.find((g) => g.key === 'visual');
    expect(visual?.score).toBe(0);
  });

  it('treats default primary color as incomplete', () => {
    const brand = { id: 'brand-1', primaryColor: '#000000' };
    const result = computeBrandCompleteness(brand);
    const visual = result.groups.find((g) => g.key === 'visual');
    const colorField = visual?.fields.find((f) => f.key === 'primaryColor');
    expect(colorField?.isComplete).toBe(false);
  });

  it('treats non-default primary color as complete', () => {
    const brand = { id: 'brand-1', primaryColor: '#FF0000' };
    const result = computeBrandCompleteness(brand);
    const visual = result.groups.find((g) => g.key === 'visual');
    const colorField = visual?.fields.find((f) => f.key === 'primaryColor');
    expect(colorField?.isComplete).toBe(true);
  });

  it('generates correct hrefs for fields', () => {
    const result = computeBrandCompleteness({ id: 'abc-123' });

    const identity = result.groups.find((g) => g.key === 'identity');
    expect(identity?.fields[0].href).toBe('/settings/brands/abc-123');

    const voice = result.groups.find((g) => g.key === 'voice');
    expect(voice?.fields[0].href).toBe('/settings/brands/abc-123/voice');
  });

  it('uses weighted average for overall score', () => {
    // All identity complete (25%), rest empty
    const brand = {
      description: 'Desc',
      id: 'brand-1',
      label: 'Acme',
      logo: { id: 'l' },
      text: 'Prompt',
    };

    const result = computeBrandCompleteness(brand);

    // Identity: 100% * 0.25 = 25
    // Voice: 0% * 0.35 = 0
    // Strategy: 0% * 0.2 = 0
    // Visual: 0% * 0.2 = 0
    expect(result.overallScore).toBe(25);
  });

  it('lists all 4 groups', () => {
    const result = computeBrandCompleteness(createEmptyBrand());
    expect(result.groups).toHaveLength(4);
    expect(result.groups.map((g) => g.key)).toEqual([
      'identity',
      'voice',
      'strategy',
      'visual',
    ]);
  });
});
