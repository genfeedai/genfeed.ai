/**
 * Versioned judge rubrics in autoevals' ModelGradedSpec shape (prompt
 * template + choice scores). The pairwise prompt is autoevals' own `battle`
 * template; the pointwise rubric is ours. A rubric is never edited in place:
 * a wording change is a new version, and the digest in every report proves
 * which text a score came from.
 */

import { templates } from 'autoevals';
import type { EvalRubricSpec, RubricRecord } from '../contracts';
import { canonicalJson, sha256Digest } from '../provenance';

export const AUTOEVALS_VERSION = '0.3.0';

export const CONTENT_QUALITY_RUBRIC: EvalRubricSpec = {
  choiceScores: { '1': 0, '2': 0.25, '3': 0.5, '4': 0.75, '5': 1 },
  id: 'content-quality',
  promptTemplate: [
    'You are grading a piece of social content written for a brand.',
    '[BEGIN DATA]',
    '***',
    '[Brief]: {{input}}',
    '***',
    '[Brand guidance]: {{guidance}}',
    '***',
    '[Content]: {{output}}',
    '***',
    '[END DATA]',
    'Rate the content from 1 to 5, weighing in order: does it do what the brief asks;',
    'does it follow the brand guidance (voice, banned phrases, audience); would a',
    'careful editor publish it unchanged. 1 = unusable, 3 = publishable with edits,',
    '5 = publish as is. Judge only the content, never its length.',
  ].join('\n'),
  source: 'genfeed:content-eval',
  version: 'content-quality-v1',
};

/**
 * Checkable claims instead of a 1-5 scale (#5604). Each claim is answered
 * pass, fail or not-applicable; the score is the share of applicable claims
 * that pass. It has no calibration report yet, so it can be judged in the
 * judge suite but cannot gate or optimize.
 */
export const CONTENT_CLAIMS_RUBRIC: EvalRubricSpec = {
  calibrationReport: null,
  choiceScores: {},
  claims: [
    {
      id: 'brief-ask',
      text: 'The content does what the brief asks: its format, its topic and every explicit requirement.',
    },
    {
      id: 'supported-facts',
      text: 'Every fact, number, price, offer, date or quote in the content is stated in the brief or the brand guidance.',
    },
    {
      id: 'banned-phrases',
      text: 'The content uses none of the phrases or topics the brand guidance bans.',
    },
    {
      id: 'voice',
      text: 'The tone of the content matches the voice the brand guidance describes.',
    },
    {
      id: 'audience',
      text: 'The content speaks to the audience the brand guidance names.',
    },
    {
      id: 'hook',
      text: 'The first sentence gives the reader a concrete reason to keep reading.',
    },
    {
      id: 'call-to-action',
      text: 'When the brief asks for a next step, the content ends with one the reader can take.',
    },
    {
      id: 'publishable',
      text: 'A careful editor would publish the content without changing what it says.',
    },
  ],
  id: 'content-claims',
  promptTemplate: [
    'You are checking a piece of social content written for a brand.',
    '[BEGIN DATA]',
    '***',
    '[Brief]: {{input}}',
    '***',
    '[Brand guidance]: {{guidance}}',
    '***',
    '[Content]: {{output}}',
    '***',
    '[END DATA]',
    'Check each claim below against the content only, never its length.',
    'Answer pass when the claim holds, fail when it does not, and not-applicable',
    'only when the brief and guidance give the claim nothing to check.',
    '[Claims]:',
    '{{claims}}',
  ].join('\n'),
  source: 'genfeed:content-eval',
  version: 'content-claims-v1',
};

export const BATTLE_RUBRIC: EvalRubricSpec = {
  choiceScores: templates.battle.choice_scores,
  id: 'battle',
  promptTemplate: templates.battle.prompt,
  source: `autoevals@${AUTOEVALS_VERSION}:battle`,
  version: `autoevals-battle@${AUTOEVALS_VERSION}`,
};

export const RUBRICS_BY_VERSION = new Map(
  [CONTENT_QUALITY_RUBRIC, CONTENT_CLAIMS_RUBRIC, BATTLE_RUBRIC].map((spec) => [
    spec.version,
    spec,
  ]),
);

export function isClaimRubric(spec: EvalRubricSpec): boolean {
  return (spec.claims?.length ?? 0) > 0;
}

/**
 * A claim rubric scores a gating or optimizing suite only once a calibration
 * report for its exact revision exists. The judge suite is exempt: it is the
 * calibration run that produces that report.
 */
export function assertRubricMayGate(spec: EvalRubricSpec): void {
  if (isClaimRubric(spec) && !spec.calibrationReport) {
    throw new Error(
      `Rubric ${spec.version} has no calibration report for digest ${rubricDigest(spec)}; run it in the judge suite (#4924) and link the report before it gates or optimizes.`,
    );
  }
}

/** The claim list as the judge sees it: one `- [id] text` line per claim. */
export function renderClaims(spec: EvalRubricSpec): string {
  return (spec.claims ?? [])
    .map((claim) => `- [${claim.id}] ${claim.text}`)
    .join('\n');
}

export function rubricDigest(spec: EvalRubricSpec): string {
  // Choice rubrics keep the digest they had before claims existed.
  return sha256Digest(
    canonicalJson({
      choiceScores: spec.choiceScores,
      ...(isClaimRubric(spec) ? { claims: spec.claims } : {}),
      promptTemplate: spec.promptTemplate,
    }),
  );
}

export function toRubricRecord(spec: EvalRubricSpec): RubricRecord {
  return {
    choiceScores: spec.choiceScores,
    ...(isClaimRubric(spec) ? { claims: [...(spec.claims ?? [])] } : {}),
    digest: rubricDigest(spec),
    id: spec.id,
    source: spec.source,
    version: spec.version,
  };
}

/**
 * `{{name}}` substitution as autoevals renders it: strings verbatim, anything
 * else as JSON. Mustache sections are not supported, and an unknown variable
 * is an error rather than an empty string, so a rubric typo cannot silently
 * blank part of a prompt.
 */
export function renderTemplate(
  template: string,
  variables: Record<string, unknown>,
): string {
  return template.replace(
    /\{\{\s*([^}\s]+)\s*\}\}/g,
    (_match, name: string) => {
      if (
        name.startsWith('#') ||
        name.startsWith('/') ||
        name.startsWith('^')
      ) {
        throw new Error(`Rubric sections are not supported: {{${name}}}`);
      }
      if (!(name in variables)) {
        throw new Error(`Rubric variable {{${name}}} has no value`);
      }

      const value = variables[name];
      return typeof value === 'string' ? value : JSON.stringify(value);
    },
  );
}
