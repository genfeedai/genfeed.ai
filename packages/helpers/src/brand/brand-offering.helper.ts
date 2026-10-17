export type BrandOfferingKind = 'physical' | 'service' | 'software' | 'unknown';

export const BRAND_OFFERING_SUBJECT_LOCK: Record<BrandOfferingKind, string> = {
  physical:
    'Depict the named physical product. Do not replace it with a different object.',
  service:
    'This brand is a service. Depict the person and the outcome. Do not invent a device, bottle, package, or gadget the user did not name.',
  software:
    'This brand is software. Depict the person and the feeling the outcome changes. Do not invent a device, bottle, package, or gadget. For hiring or recruiting, the feeling is finding the right person or being chosen.',
  unknown: 'Do not invent a physical product the user did not name.',
};

const SOFTWARE_OFFERING =
  /\b(?:saas|software|platforms?|apps?|ats|crm|dashboards?)\b/iu;
const RECRUITING_OFFERING = /\b(?:recruit\w*|hiring|candidates?)\b/iu;
const PHYSICAL_OFFERING =
  /\b(?:bottles?|devices?|hardware|packaging|earbuds?|skincare|cosmetics|sneakers?|shoes?|apparel|supplements?|jewel(?:ry|lery))\b/iu;
const SERVICE_OFFERING =
  /\b(?:agenc(?:y|ies)|consultanc(?:y|ies)|consulting)\b/iu;
const INVENTED_PHYSICAL_PRODUCT = String.raw`\b(?:bottles?|earbuds?|gadgets?|devices?|packages?|packaging|skincare)\b`;

function countMatches(pattern: RegExp, text: string): number {
  return [...text.matchAll(new RegExp(pattern.source, 'giu'))].length;
}

/**
 * Software and platform language wins when a page also shows a physical object.
 * A physical offering wins only when its terms outnumber every other kind, so a
 * bottle brand with a companion app stays physical. The word "product" alone is
 * not a physical offering.
 */
export function classifyBrandOffering(text: string): BrandOfferingKind {
  const physicalCount = countMatches(PHYSICAL_OFFERING, text);
  if (
    physicalCount >
    Math.max(
      countMatches(SOFTWARE_OFFERING, text) +
        countMatches(RECRUITING_OFFERING, text),
      countMatches(SERVICE_OFFERING, text),
    )
  ) {
    return 'physical';
  }
  if (SOFTWARE_OFFERING.test(text)) {
    return 'software';
  }
  if (SERVICE_OFFERING.test(text)) {
    return 'service';
  }
  if (RECRUITING_OFFERING.test(text)) {
    return 'software';
  }
  if (PHYSICAL_OFFERING.test(text)) {
    return 'physical';
  }
  return 'unknown';
}

export function brandOfferingSubjectLock(kind: BrandOfferingKind): string {
  return BRAND_OFFERING_SUBJECT_LOCK[kind];
}

export function lockMediaUserPrompt(
  userPrompt: string,
  corpus: string,
): string {
  const lock = brandOfferingSubjectLock(classifyBrandOffering(corpus));
  const trimmed = userPrompt.trim();
  return trimmed.length > 0 ? `${lock}\n\n${trimmed}` : lock;
}

function physicalProductTerms(text: string): string[] {
  return [...text.matchAll(new RegExp(INVENTED_PHYSICAL_PRODUCT, 'giu'))].map(
    (match) => match[0].toLowerCase(),
  );
}

/**
 * A software, service, or unknown prompt fails when the output names a
 * physical product the user did not name. A physical offering may name one.
 */
export function scoreBrandOfferingPrompt(input: {
  kind: BrandOfferingKind;
  output: string;
  userPrompt: string;
}): { isPass: boolean; violations: string[] } {
  if (input.kind === 'physical') {
    return { isPass: true, violations: [] };
  }
  const named = new Set(physicalProductTerms(input.userPrompt));
  const violations = [
    ...new Set(
      physicalProductTerms(input.output).filter((term) => !named.has(term)),
    ),
  ];
  return { isPass: violations.length === 0, violations };
}
