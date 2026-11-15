import type {
  BrandGenerationRulesV1,
  BrandIdentitySnapshotV1,
} from '@genfeedai/contracts/interfaces';

const MEDIA_KIND = 'video';
const RULE_TEXT_LIMIT = 600;
const TEXT_RULE_LIMIT = 24;
const FACT_LIMIT = 16;
const EXAMPLE_LIMIT = 8;

export const VISUAL_BRAND_HARNESS_CHAR_LIMIT = 12_000;
export const VISUAL_BRAND_SKILLS_CHAR_LIMIT = 24_000;

export interface IVisualBrandPaletteRole {
  role: string;
  color: string;
  isRequired: boolean;
}

export interface IVisualBrandTypeRole {
  role: string;
  family: string;
  weight: number;
  style: string;
  availability: string;
  isRequired: boolean;
}

export interface IVisualBrandAsset {
  assetId: string;
  role: string;
  isRequired: boolean;
  mimeType?: string;
  /** True when the renderer stages this asset, so staticFile can load it. */
  isStaged: boolean;
}

export interface IVisualBrandFact {
  subject: string;
  predicate: string;
  value: string | number | boolean;
  unit?: string;
  isRequired: boolean;
}

/**
 * The brand, as the Motion authoring model sees it: only what a coded video
 * can use, taken from one approved (or provisional) Brand OS revision.
 */
export interface IVisualBrandContext {
  approval: BrandIdentitySnapshotV1['approval'];
  revision: { id: string; version: number };
  identity: BrandIdentitySnapshotV1['identity'];
  voice: {
    tone?: string;
    style?: string;
    audience: string[];
    values: string[];
    avoid: string[];
  };
  paletteRoles: IVisualBrandPaletteRole[];
  typeRoles: IVisualBrandTypeRole[];
  logo: IVisualBrandAsset[];
  brandAssets: IVisualBrandAsset[];
  facts: IVisualBrandFact[];
  mandatory: string[];
  avoid: string[];
  examples: Array<{ polarity: 'positive' | 'negative'; text: string }>;
  /** `generationRules.video` once the Brand Kit carries a video section. */
  videoIdentity: unknown;
  harnessBrief: string;
  skills: string;
}

function appliesToVideo(rule: {
  appliesToMediaKinds?: readonly string[];
}): boolean {
  return (
    rule.appliesToMediaKinds === undefined ||
    rule.appliesToMediaKinds.includes(MEDIA_KIND)
  );
}

function clip(text: string, limit: number): string {
  return text.length > limit ? text.slice(0, limit) : text;
}

function readVideoIdentity(rules: BrandGenerationRulesV1): unknown {
  return (rules as BrandGenerationRulesV1 & { video?: unknown }).video ?? null;
}

export function projectVisualBrandContext(input: {
  snapshot: BrandIdentitySnapshotV1;
  stagedAssetIds: readonly string[];
  harnessBrief: string;
  skills: string;
}): IVisualBrandContext {
  const { snapshot } = input;
  const rules = snapshot.generationRules;
  const asset = (entry: BrandGenerationRulesV1['assets'][number]) => ({
    assetId: entry.assetId,
    role: entry.role,
    isRequired: entry.required,
    ...(entry.mimeType ? { mimeType: entry.mimeType } : {}),
    isStaged: input.stagedAssetIds.includes(entry.assetId),
  });
  const assets = rules.assets.filter(appliesToVideo);
  return {
    approval: snapshot.approval,
    revision: { id: snapshot.revisionId, version: snapshot.revisionVersion },
    identity: snapshot.identity,
    voice: {
      ...(snapshot.voice.tone ? { tone: snapshot.voice.tone } : {}),
      ...(snapshot.voice.style ? { style: snapshot.voice.style } : {}),
      audience: snapshot.voice.audience,
      values: snapshot.voice.values,
      avoid: snapshot.voice.avoid,
    },
    paletteRoles: rules.palette.filter(appliesToVideo).map((rule) => ({
      role: rule.usage,
      color: rule.color,
      isRequired: rule.required,
    })),
    typeRoles: rules.typography.filter(appliesToVideo).map((rule) => ({
      role: rule.role,
      family: rule.family,
      weight: rule.weight,
      style: rule.style,
      availability: rule.availability,
      isRequired: rule.required,
    })),
    logo: assets.filter((entry) => entry.role === 'logo').map(asset),
    brandAssets: assets.filter((entry) => entry.role !== 'logo').map(asset),
    facts: rules.facts
      .filter(appliesToVideo)
      .slice(0, FACT_LIMIT)
      .map((fact) => ({
        subject: fact.subject,
        predicate: fact.predicate,
        value:
          typeof fact.value === 'string' ? clip(fact.value, 200) : fact.value,
        ...(fact.unit ? { unit: fact.unit } : {}),
        isRequired: fact.required,
      })),
    mandatory: rules.mandatory
      .filter(appliesToVideo)
      .slice(0, TEXT_RULE_LIMIT)
      .map((rule) => clip(rule.text, RULE_TEXT_LIMIT)),
    avoid: rules.avoid
      .filter(appliesToVideo)
      .slice(0, TEXT_RULE_LIMIT)
      .map((rule) => clip(rule.text, RULE_TEXT_LIMIT)),
    examples: rules.examples.slice(0, EXAMPLE_LIMIT).map((rule) => ({
      polarity: rule.polarity,
      text: clip(rule.text, RULE_TEXT_LIMIT),
    })),
    videoIdentity: readVideoIdentity(rules),
    harnessBrief: clip(input.harnessBrief, VISUAL_BRAND_HARNESS_CHAR_LIMIT),
    skills: clip(input.skills, VISUAL_BRAND_SKILLS_CHAR_LIMIT),
  };
}
