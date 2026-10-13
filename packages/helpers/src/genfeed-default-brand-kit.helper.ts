import {
  GENFEED_DEFAULT_KIT_AVOID_RULES,
  GENFEED_DEFAULT_KIT_EVIDENCE_ID,
  GENFEED_DEFAULT_KIT_LABEL,
  GENFEED_DEFAULT_KIT_MANDATORY_RULES,
  GENFEED_DEFAULT_KIT_PALETTE,
  GENFEED_DEFAULT_KIT_SOURCE_ID,
  GENFEED_DEFAULT_KIT_TYPOGRAPHY,
  GENFEED_DEFAULT_KIT_VOICE,
} from '@genfeedai/contracts/constants';
import type {
  BrandGenerationRulesV1,
  IBrandKitDraft,
  IBrandKitSourceEvidence,
} from '@genfeedai/contracts/interfaces';
import {
  type BrandKitSourceBrand,
  buildBrandKitDraftFromBrand,
} from './brand-kit-contract.helper';

const DEFAULT_KIT_EVIDENCE: IBrandKitSourceEvidence = {
  label: GENFEED_DEFAULT_KIT_LABEL,
  sourceId: GENFEED_DEFAULT_KIT_SOURCE_ID,
  sourceType: 'system',
};

function buildGenfeedDefaultKitRules(): BrandGenerationRulesV1 {
  const evidenceIds = [GENFEED_DEFAULT_KIT_EVIDENCE_ID];
  return {
    assets: [],
    avoid: GENFEED_DEFAULT_KIT_AVOID_RULES.map((rule) => ({
      evidenceIds,
      id: rule.id,
      match: 'semantic' as const,
      required: false,
      text: rule.text,
    })),
    evidence: [
      {
        id: GENFEED_DEFAULT_KIT_EVIDENCE_ID,
        label: GENFEED_DEFAULT_KIT_LABEL,
        sourceId: GENFEED_DEFAULT_KIT_SOURCE_ID,
        sourceType: 'system',
      },
    ],
    examples: [],
    facts: [],
    mandatory: GENFEED_DEFAULT_KIT_MANDATORY_RULES.map((rule) => ({
      evidenceIds,
      id: rule.id,
      match: 'semantic' as const,
      required: false,
      text: rule.text,
    })),
    palette: [
      {
        color: GENFEED_DEFAULT_KIT_PALETTE.background,
        evidenceIds,
        id: 'palette_background',
        required: false,
        usage: 'Background',
      },
      {
        color: GENFEED_DEFAULT_KIT_PALETTE.text,
        evidenceIds,
        id: 'palette_text',
        required: false,
        usage: 'Text',
      },
      {
        color: GENFEED_DEFAULT_KIT_PALETTE.accent,
        evidenceIds,
        id: 'palette_accent',
        required: false,
        usage: 'Accent',
      },
    ],
    schemaVersion: 1,
    typography: [
      {
        availability: 'unknown',
        evidenceIds,
        family: GENFEED_DEFAULT_KIT_TYPOGRAPHY.body.family,
        id: 'type_body',
        required: false,
        role: 'body',
        style: 'normal',
        weight: GENFEED_DEFAULT_KIT_TYPOGRAPHY.body.weight,
      },
      {
        availability: 'unknown',
        evidenceIds,
        family: GENFEED_DEFAULT_KIT_TYPOGRAPHY.display.family,
        id: 'type_display',
        required: false,
        role: 'display',
        style: 'normal',
        weight: GENFEED_DEFAULT_KIT_TYPOGRAPHY.display.weight,
      },
    ],
  };
}

/**
 * Builds the Genfeed default style kit as a Brand OS DRAFT for a brand. The
 * brand keeps its own name and description; everything else is style only.
 */
export function buildGenfeedDefaultKitDraft(
  brand: Pick<BrandKitSourceBrand, 'id' | 'label' | 'description'> &
    Partial<BrandKitSourceBrand>,
): IBrandKitDraft {
  const draft = buildBrandKitDraftFromBrand(
    {
      id: brand.id,
      organization: brand.organization,
      label: brand.label,
      description: brand.description,
      primaryColor: GENFEED_DEFAULT_KIT_PALETTE.text,
      secondaryColor: GENFEED_DEFAULT_KIT_PALETTE.accent,
      backgroundColor: GENFEED_DEFAULT_KIT_PALETTE.background,
      fontFamily: GENFEED_DEFAULT_KIT_TYPOGRAPHY.body.family,
      text: GENFEED_DEFAULT_KIT_VOICE.promptGuidelines,
      agentConfig: {
        voice: {
          audience: [...GENFEED_DEFAULT_KIT_VOICE.audience],
          doNotSoundLike: [...GENFEED_DEFAULT_KIT_VOICE.doNotSoundLike],
          sampleOutput: GENFEED_DEFAULT_KIT_VOICE.sampleOutput,
          style: GENFEED_DEFAULT_KIT_VOICE.style,
          tone: GENFEED_DEFAULT_KIT_VOICE.tone,
          values: [...GENFEED_DEFAULT_KIT_VOICE.values],
        },
      },
    },
    { evidence: [DEFAULT_KIT_EVIDENCE], sourceType: 'system' },
  );
  return { ...draft, generationRules: buildGenfeedDefaultKitRules() };
}

/** True while a draft still carries the Genfeed default marker. */
export function isGenfeedDefaultKitDraft(
  content: IBrandKitDraft | null | undefined,
): boolean {
  return (
    Array.isArray(content?.evidence) &&
    content.evidence.some(
      (entry) =>
        entry?.sourceType === 'system' &&
        entry.sourceId === GENFEED_DEFAULT_KIT_SOURCE_ID,
    )
  );
}

/**
 * Removes the default-kit marker and its seeded generation rules once an owner
 * edits the draft: from then on the draft is the owner's own.
 */
export function stripGenfeedDefaultKit(
  content: IBrandKitDraft,
): IBrandKitDraft {
  const stripped: IBrandKitDraft = {
    ...content,
    evidence: content.evidence.filter(
      (entry) => entry?.sourceId !== GENFEED_DEFAULT_KIT_SOURCE_ID,
    ),
    sourceType: 'manual',
  };
  Reflect.deleteProperty(stripped, 'generationRules');
  return stripped;
}

/** Values the signup analysis writes when it finds nothing about the brand. */
const SYSTEM_DEFAULT_VOICE_VALUES: ReadonlySet<string> = new Set([
  'friendly and informative',
  'general audience',
  'professional',
]);

function isOwnVoiceText(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 && !SYSTEM_DEFAULT_VOICE_VALUES.has(normalized);
}

/**
 * True once the owner (or a scan of their site) has put voice into the brand.
 * Voice the signup analysis defaulted on its own does not count, so a brand
 * nobody has described keeps the Genfeed default style kit.
 */
export function hasOwnBrandVoice(agentConfig: unknown): boolean {
  const voice =
    agentConfig && typeof agentConfig === 'object'
      ? Reflect.get(agentConfig, 'voice')
      : undefined;
  if (!voice || typeof voice !== 'object') return false;
  for (const key of ['tone', 'style', 'sampleOutput'])
    if (isOwnVoiceText(Reflect.get(voice, key))) return true;
  for (const key of [
    'audience',
    'values',
    'messagingPillars',
    'doNotSoundLike',
  ]) {
    const entries = Reflect.get(voice, key);
    if (Array.isArray(entries) && entries.some(isOwnVoiceText)) return true;
  }
  return false;
}
