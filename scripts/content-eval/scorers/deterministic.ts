/**
 * Deterministic checks: no model call, run on every generated or judged text
 * before a judge sees it. An output that fails one is still judged (the score
 * is data), but it can never count as accepted.
 */

import { getPlatformPreviewLimit } from '@genfeedai/contracts/constants';
import { z } from 'zod';
import type {
  ContentBrief,
  CountRange,
  DeterministicCheck,
  FixtureRow,
} from '../contracts';

const LINK_PATTERN = /\bhttps?:\/\/[^\s)]+/gi;
const HASHTAG_PATTERN = /(^|\s)#[\p{L}\p{N}_]+/gu;
const CTA_PATTERN =
  /\b(buy|book|click|comment|download|follow|get|join|learn more|order|register|reply|save|shop|share|sign up|subscribe|try|visit)\b/i;

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function rangeCheck(
  id: string,
  actual: number,
  range: CountRange | undefined,
): DeterministicCheck | null {
  if (!range) {
    return null;
  }

  return {
    detail: `${actual} (allowed ${range.min}–${range.max})`,
    id,
    passed: actual >= range.min && actual <= range.max,
  };
}

function lengthChecks(
  text: string,
  brief: ContentBrief,
  platform: string | undefined,
): DeterministicCheck[] {
  const checks: DeterministicCheck[] = [];
  const length = [...text].length;
  const platformMax = platform
    ? getPlatformPreviewLimit(platform)?.captionMaxLength
    : undefined;

  if (brief.maxCharacters !== undefined) {
    checks.push({
      detail: `${length}/${brief.maxCharacters} characters`,
      id: 'brief-max-length',
      passed: length <= brief.maxCharacters,
    });
  }
  if (brief.minCharacters !== undefined) {
    checks.push({
      detail: `${length}/${brief.minCharacters} minimum characters`,
      id: 'brief-min-length',
      passed: length >= brief.minCharacters,
    });
  }
  if (platformMax !== undefined) {
    checks.push({
      detail: `${length}/${platformMax} characters on ${platform}`,
      id: 'platform-max-length',
      passed: length <= platformMax,
    });
  }

  return checks;
}

/**
 * Compiles a fixture's output schema. Called for every row before a run
 * starts, so an unsupported schema fails validation, not a paid run.
 */
export function compileOutputSchema(
  schema: Record<string, unknown>,
): z.ZodType {
  try {
    return z.fromJSONSchema(schema);
  } catch (error: unknown) {
    throw new Error(
      `Unsupported outputJsonSchema: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function jsonSchemaCheck(
  text: string,
  schema: Record<string, unknown> | undefined,
): DeterministicCheck | null {
  if (!schema) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { detail: 'output is not JSON', id: 'json-schema', passed: false };
  }

  const result = compileOutputSchema(schema).safeParse(parsed);
  return {
    detail: result.success
      ? 'matches output schema'
      : (result.error.issues[0]?.message ?? 'schema mismatch'),
    id: 'json-schema',
    passed: result.success,
  };
}

export function runDeterministicChecks(
  text: string,
  row: FixtureRow,
): DeterministicCheck[] {
  const { brief, platform } = row.input;
  const lowered = text.toLowerCase();
  const bannedHits = brief.bannedPhrases.filter((phrase) =>
    lowered.includes(phrase.toLowerCase()),
  );
  const checks: Array<DeterministicCheck | null> = [
    {
      detail: text.trim().length > 0 ? 'non-empty' : 'empty output',
      id: 'non-empty',
      passed: text.trim().length > 0,
    },
    ...lengthChecks(text, brief, platform),
    {
      detail:
        bannedHits.length === 0
          ? 'no banned phrases'
          : `banned: ${bannedHits.join(', ')}`,
      id: 'banned-phrases',
      passed: bannedHits.length === 0,
    },
    brief.isCtaRequired
      ? {
          detail: CTA_PATTERN.test(text) ? 'CTA present' : 'no CTA found',
          id: 'cta-present',
          passed: CTA_PATTERN.test(text),
        }
      : null,
    rangeCheck('link-count', countMatches(text, LINK_PATTERN), brief.linkRange),
    rangeCheck(
      'hashtag-count',
      countMatches(text, HASHTAG_PATTERN),
      brief.hashtagRange,
    ),
    jsonSchemaCheck(text, brief.outputJsonSchema),
  ];

  return checks.filter((check): check is DeterministicCheck => check !== null);
}

export function hasPassedAll(checks: DeterministicCheck[]): boolean {
  return checks.every((check) => check.passed);
}
