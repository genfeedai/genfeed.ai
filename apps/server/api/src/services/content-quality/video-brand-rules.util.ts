import type { BrandGenerationRulesV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';

const MAX_RULES_PER_SECTION = 12;

export interface VideoBrandRules {
  /** Prompt text for the judge; empty when the brand states no video rules. */
  text: string;
  /** Brand asset ids of approved logos that apply to video. */
  logoAssetIds: string[];
}

function appliesToVideo(rule: {
  appliesToMediaKinds?: readonly string[] | undefined;
}): boolean {
  return (
    rule.appliesToMediaKinds === undefined ||
    rule.appliesToMediaKinds.includes('video')
  );
}

function section(header: string, lines: readonly string[]): string {
  return lines.length === 0
    ? ''
    : `${header}\n${lines
        .slice(0, MAX_RULES_PER_SECTION)
        .map((line) => `- ${line}`)
        .join('\n')}`;
}

/**
 * The approved Brand OS rules that apply to video, as judge input: palette,
 * logo and the mandatory / avoid rules. Rules scoped to other media kinds are
 * left out. Pixel-level proof of these rules lives in brand validation; this
 * is what the vision judge is told to look for.
 */
export function buildVideoBrandRules(
  rules: BrandGenerationRulesV1 | null | undefined,
): VideoBrandRules {
  if (!rules) {
    return { logoAssetIds: [], text: '' };
  }

  const palette = rules.palette
    .filter(appliesToVideo)
    .map(
      (rule) =>
        `${rule.color} (${rule.usage})${rule.required ? ', required' : ''}`,
    );
  const logos = rules.assets.filter(
    (asset) => asset.role === 'logo' && appliesToVideo(asset),
  );
  const logoLines = logos.map((asset) =>
    asset.required
      ? 'The approved logo must appear in the video (reference image attached when available).'
      : 'The approved logo may appear; if it does it must match the reference image.',
  );
  const mandatory = rules.mandatory
    .filter(appliesToVideo)
    .map((rule) => rule.text);
  const avoid = rules.avoid.filter(appliesToVideo).map((rule) => rule.text);

  const text = [
    section('Approved palette:', palette),
    section('Logo:', [...new Set(logoLines)]),
    section('Must be present:', mandatory),
    section('Must be avoided:', avoid),
  ]
    .filter((part) => part.length > 0)
    .join('\n\n');

  return {
    logoAssetIds: logos.map((asset) => asset.assetId),
    text,
  };
}
