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

export const BATTLE_RUBRIC: EvalRubricSpec = {
  choiceScores: templates.battle.choice_scores,
  id: 'battle',
  promptTemplate: templates.battle.prompt,
  source: `autoevals@${AUTOEVALS_VERSION}:battle`,
  version: `autoevals-battle@${AUTOEVALS_VERSION}`,
};

export const RUBRICS_BY_VERSION = new Map(
  [CONTENT_QUALITY_RUBRIC, BATTLE_RUBRIC].map((spec) => [spec.version, spec]),
);

export function rubricDigest(spec: EvalRubricSpec): string {
  return sha256Digest(
    canonicalJson({
      choiceScores: spec.choiceScores,
      promptTemplate: spec.promptTemplate,
    }),
  );
}

export function toRubricRecord(spec: EvalRubricSpec): RubricRecord {
  return {
    choiceScores: spec.choiceScores,
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
