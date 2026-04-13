/**
 * Brand completeness scoring — computes per-group and overall
 * completeness for a serialized brand object.
 */

export interface BrandCompletenessField {
  key: string;
  label: string;
  isComplete: boolean;
  href: string;
}

export interface BrandCompletenessGroup {
  key: 'identity' | 'voice' | 'strategy' | 'visual';
  label: string;
  score: number;
  weight: number;
  fields: BrandCompletenessField[];
}

export interface BrandCompletenessResult {
  overallScore: number;
  groups: BrandCompletenessGroup[];
  incompleteFields: BrandCompletenessField[];
}

interface BrandForCompleteness {
  id?: string;
  slug?: string;
  label?: string;
  description?: string;
  text?: string;
  logo?: unknown;
  primaryColor?: string;
  references?: unknown[];
  agentConfig?: {
    voice?: {
      tone?: string;
      style?: string;
      audience?: string[];
      values?: string[];
      sampleOutput?: string;
      messagingPillars?: string[];
      doNotSoundLike?: string[];
    };
    strategy?: {
      contentTypes?: string[];
      platforms?: string[];
      goals?: string[];
      frequency?: string;
    };
    persona?: string;
  };
}

interface FieldDef {
  key: string;
  label: string;
  href: string;
  check: (brand: BrandForCompleteness) => boolean;
}

const DEFAULT_PRIMARY_COLOR = '#000000';

function hasValue(val: unknown): boolean {
  if (val === undefined || val === null) return false;
  if (typeof val === 'string') return val.trim().length > 0;
  if (Array.isArray(val)) return val.length > 0;
  return Boolean(val);
}

function brandHref(brandId: string, sub?: string): string {
  const base = `/settings/brands/${brandId}`;
  return sub ? `${base}/${sub}` : base;
}

function buildFieldDefs(brandId: string): Record<string, FieldDef[]> {
  const href = (sub?: string) => brandHref(brandId, sub);

  return {
    identity: [
      {
        check: (b) => hasValue(b.label),
        href: href(),
        key: 'label',
        label: 'Brand name',
      },
      {
        check: (b) => hasValue(b.description),
        href: href(),
        key: 'description',
        label: 'Description',
      },
      {
        check: (b) => hasValue(b.logo),
        href: href(),
        key: 'logo',
        label: 'Logo',
      },
      {
        check: (b) => hasValue(b.text),
        href: href(),
        key: 'text',
        label: 'System prompt',
      },
    ],
    strategy: [
      {
        check: (b) => hasValue(b.agentConfig?.strategy?.contentTypes),
        href: href('voice'),
        key: 'contentTypes',
        label: 'Content types',
      },
      {
        check: (b) => hasValue(b.agentConfig?.strategy?.platforms),
        href: href('voice'),
        key: 'platforms',
        label: 'Platforms',
      },
      {
        check: (b) => hasValue(b.agentConfig?.strategy?.goals),
        href: href('voice'),
        key: 'goals',
        label: 'Goals',
      },
      {
        check: (b) => hasValue(b.agentConfig?.strategy?.frequency),
        href: href('voice'),
        key: 'frequency',
        label: 'Posting frequency',
      },
    ],
    visual: [
      {
        check: (b) =>
          hasValue(b.primaryColor) && b.primaryColor !== DEFAULT_PRIMARY_COLOR,
        href: href(),
        key: 'primaryColor',
        label: 'Brand color',
      },
      {
        check: (b) => hasValue(b.references),
        href: href(),
        key: 'references',
        label: 'Reference images',
      },
    ],
    voice: [
      {
        check: (b) => hasValue(b.agentConfig?.voice?.tone),
        href: href('voice'),
        key: 'tone',
        label: 'Tone',
      },
      {
        check: (b) => hasValue(b.agentConfig?.voice?.style),
        href: href('voice'),
        key: 'style',
        label: 'Style',
      },
      {
        check: (b) => hasValue(b.agentConfig?.voice?.audience),
        href: href('voice'),
        key: 'audience',
        label: 'Target audience',
      },
      {
        check: (b) => hasValue(b.agentConfig?.voice?.values),
        href: href('voice'),
        key: 'values',
        label: 'Brand values',
      },
      {
        check: (b) => hasValue(b.agentConfig?.voice?.sampleOutput),
        href: href('voice'),
        key: 'sampleOutput',
        label: 'Sample output',
      },
      {
        check: (b) => hasValue(b.agentConfig?.voice?.messagingPillars),
        href: href('voice'),
        key: 'messagingPillars',
        label: 'Messaging pillars',
      },
      {
        check: (b) => hasValue(b.agentConfig?.voice?.doNotSoundLike),
        href: href('voice'),
        key: 'doNotSoundLike',
        label: 'Avoid sounding like',
      },
    ],
  };
}

const GROUP_META: Array<{
  key: BrandCompletenessGroup['key'];
  label: string;
  weight: number;
}> = [
  { key: 'identity', label: 'Identity', weight: 0.25 },
  { key: 'voice', label: 'Voice', weight: 0.35 },
  { key: 'strategy', label: 'Strategy', weight: 0.2 },
  { key: 'visual', label: 'Visual', weight: 0.2 },
];

export function computeBrandCompleteness(
  brand: BrandForCompleteness,
): BrandCompletenessResult {
  const brandId = brand.slug ?? brand.id ?? '';
  const fieldDefs = buildFieldDefs(brandId);
  const incompleteFields: BrandCompletenessField[] = [];

  const groups: BrandCompletenessGroup[] = GROUP_META.map((meta) => {
    const defs = fieldDefs[meta.key];
    const fields: BrandCompletenessField[] = defs.map((def) => {
      const isComplete = def.check(brand);
      const field: BrandCompletenessField = {
        href: def.href,
        isComplete,
        key: def.key,
        label: def.label,
      };
      if (!isComplete) {
        incompleteFields.push(field);
      }
      return field;
    });

    const filled = fields.filter((f) => f.isComplete).length;
    const score =
      defs.length > 0 ? Math.round((filled / defs.length) * 100) : 100;

    return {
      fields,
      key: meta.key,
      label: meta.label,
      score,
      weight: meta.weight,
    };
  });

  const overallScore = Math.round(
    groups.reduce((sum, g) => sum + g.score * g.weight, 0),
  );

  return { groups, incompleteFields, overallScore };
}
