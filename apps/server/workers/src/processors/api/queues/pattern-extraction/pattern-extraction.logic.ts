import type { PatternType } from '@genfeedai/contracts/interfaces';
import {
  PATTERN_EXTRACTION_MIN_ORGS_FOR_PUBLIC,
  PATTERN_EXTRACTION_MIN_SCORE,
  PATTERN_EXTRACTION_TOP_K,
  PRIVATE_PATTERN_TTL_MS,
  PUBLIC_PATTERN_TTL_MS,
} from '@workers/processors/api/queues/pattern-extraction/pattern-extraction.constants';
import type {
  AdPerformanceScanRow,
  ClassifiedRecord,
  ContentPerformanceScanRow,
  PatternExample,
  PatternExtractionCursor,
  PatternExtractionCursorWhere,
  PatternGroupState,
  PatternSourceKind,
  PatternUpsertPayload,
} from '@workers/processors/api/queues/pattern-extraction/pattern-extraction.types';

export function classifyHook(text: string): string {
  if (
    /^(Did|Do|Does|Are|Is|Can|Will|Have|Why|What|How|When|Where)\b/i.test(text)
  ) {
    return 'question_hook';
  }
  if (/\d+%|\d+x|\d+ times/i.test(text)) {
    return 'stat_hook';
  }
  if (/stop|warning|never|always|secret|truth|mistake/i.test(text)) {
    return 'pattern_interrupt_hook';
  }
  if (/before.*after|transform|went from/i.test(text)) {
    return 'transformation_hook';
  }
  return 'narrative_hook';
}

export function classifyCta(text: string): string {
  if (/^(Buy|Get|Start|Try|Shop|Order|Claim|Grab|Download|Sign)/i.test(text)) {
    return 'command_cta';
  }
  if (/limited|ends|today only|last chance|hurry|now/i.test(text)) {
    return 'urgency_cta';
  }
  if (/free|no cost|no charge/i.test(text)) {
    return 'free_offer_cta';
  }
  if (text.trim().endsWith('?')) {
    return 'question_cta';
  }
  return 'soft_cta';
}

export function classifyContentStructure(text: string): string {
  if (/^\d+\.|1\.|first/i.test(text)) {
    return 'list_structure';
  }
  if (text.includes('?') && text.length > 20) {
    return 'qa_structure';
  }
  if (text.length < 50) {
    return 'punchy_structure';
  }
  if (text.length > 280) {
    return 'story_structure';
  }
  return 'standard_structure';
}

export function readObjectRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function readOptionalString(
  column: string | null | undefined,
  fallback: unknown,
): string | undefined {
  if (typeof column === 'string' && column.length > 0) {
    return column;
  }
  return typeof fallback === 'string' && fallback.length > 0
    ? fallback
    : undefined;
}

export function readScore(
  column: number | null | undefined,
  data: Record<string, unknown>,
): number {
  if (typeof column === 'number' && Number.isFinite(column)) {
    return column;
  }
  const fromData = data.performanceScore;
  return typeof fromData === 'number' && Number.isFinite(fromData)
    ? fromData
    : 0;
}

export function isScoreEligible(score: number): boolean {
  return score >= PATTERN_EXTRACTION_MIN_SCORE;
}

export function buildCursorWhere(
  cursor: PatternExtractionCursor | null,
): PatternExtractionCursorWhere {
  if (!cursor) {
    return {};
  }
  return {
    OR: [
      { updatedAt: { gt: cursor.measuredAt } },
      { id: { gt: cursor.sourceId }, updatedAt: cursor.measuredAt },
    ],
  };
}

export function isInsertSinceCheckpoint(
  createdAt: Date,
  id: string,
  cursor: PatternExtractionCursor | null,
): boolean {
  if (!cursor) {
    return true;
  }
  if (createdAt.getTime() > cursor.measuredAt.getTime()) {
    return true;
  }
  return (
    createdAt.getTime() === cursor.measuredAt.getTime() && id > cursor.sourceId
  );
}

export function patternGroupKey(
  platform: string,
  industry: string,
  classifiedType: string,
  patternType: PatternType,
): string {
  return `${platform}|${industry}|${classifiedType}|${patternType}`;
}

export function emptyGroup(record: ClassifiedRecord): PatternGroupState {
  return {
    classifiedType: record.classifiedType,
    examples: [],
    industry: record.industry ?? '',
    orgIds: [],
    patternType: record.patternType,
    platform: record.platform,
    sampleSize: 0,
    scoreSum: 0,
    sources: [],
  };
}

function compareExamples(left: PatternExample, right: PatternExample): number {
  if (right.score !== left.score) {
    return right.score - left.score;
  }
  if (left.orgId !== right.orgId) {
    return left.orgId.localeCompare(right.orgId);
  }
  return left.text.localeCompare(right.text);
}

function insertTopKExample(
  examples: PatternExample[],
  next: PatternExample,
): void {
  const existingIndex = examples.findIndex(
    (example) => example.orgId === next.orgId && example.text === next.text,
  );
  if (existingIndex >= 0) {
    examples[existingIndex] = next;
  } else {
    examples.push(next);
  }
  examples.sort(compareExamples);
  if (examples.length > PATTERN_EXTRACTION_TOP_K) {
    examples.length = PATTERN_EXTRACTION_TOP_K;
  }
}

export function mergeRecordIntoGroup(
  group: PatternGroupState,
  record: ClassifiedRecord,
): void {
  if (record.isInsert) {
    group.sampleSize += 1;
    group.scoreSum += record.score;
    if (!group.orgIds.includes(record.orgId)) {
      group.orgIds.push(record.orgId);
    }
    if (!group.sources.includes(record.source)) {
      group.sources.push(record.source);
    }
  }

  insertTopKExample(group.examples, {
    orgId: record.orgId,
    platform: record.platform,
    score: record.score,
    source: record.source,
    text: record.text,
  });
}

export function mergeClassifiedRecords(
  groups: Map<string, PatternGroupState>,
  records: readonly ClassifiedRecord[],
): void {
  for (const record of records) {
    const key = patternGroupKey(
      record.platform,
      record.industry ?? '',
      record.classifiedType,
      record.patternType,
    );
    const group = groups.get(key) ?? emptyGroup(record);
    mergeRecordIntoGroup(group, record);
    groups.set(key, group);
  }
}

function pushClassified(
  records: ClassifiedRecord[],
  base: Omit<ClassifiedRecord, 'classifiedType' | 'patternType' | 'text'> & {
    patternType: PatternType;
    text: string | undefined;
    classify: (text: string) => string;
  },
): void {
  if (!base.text) {
    return;
  }
  records.push({
    classifiedType: base.classify(base.text),
    createdAt: base.createdAt,
    id: base.id,
    industry: base.industry,
    isInsert: base.isInsert,
    orgId: base.orgId,
    patternType: base.patternType,
    platform: base.platform,
    score: base.score,
    source: base.source,
    text: base.text,
  });
}

export function classifyAdRow(
  row: AdPerformanceScanRow,
  cursor: PatternExtractionCursor | null,
): ClassifiedRecord[] {
  const data = readObjectRecord(row.data);
  const score = readScore(row.performanceScore, data);
  if (!isScoreEligible(score)) {
    return [];
  }

  const platform = readOptionalString(row.adPlatform, data.adPlatform) ?? 'all';
  const industry = readOptionalString(row.industry, data.industry);
  const isInsert = isInsertSinceCheckpoint(row.createdAt, row.id, cursor);
  const base = {
    createdAt: row.createdAt,
    id: row.id,
    industry,
    isInsert,
    orgId: row.organizationId,
    platform,
    score,
    source: 'ad' as PatternSourceKind,
  };

  const classified: ClassifiedRecord[] = [];
  pushClassified(classified, {
    ...base,
    classify: classifyHook,
    patternType: 'hook_formula',
    text: readOptionalString(row.headlineText, data.headlineText),
  });
  pushClassified(classified, {
    ...base,
    classify: classifyCta,
    patternType: 'cta_formula',
    text: readOptionalString(row.ctaText, data.ctaText),
  });
  pushClassified(classified, {
    ...base,
    classify: classifyContentStructure,
    patternType: 'content_structure',
    text: readOptionalString(undefined, data.bodyText),
  });
  return classified;
}

export function classifyContentRow(
  row: ContentPerformanceScanRow,
  cursor: PatternExtractionCursor | null,
): ClassifiedRecord[] {
  const data = readObjectRecord(row.data);
  const score = readScore(row.performanceScore, data);
  if (!isScoreEligible(score)) {
    return [];
  }

  const platform = readOptionalString(row.platform, data.platform) ?? 'all';
  const isInsert = isInsertSinceCheckpoint(row.createdAt, row.id, cursor);
  const base = {
    createdAt: row.createdAt,
    id: row.id,
    isInsert,
    orgId: row.organizationId,
    platform,
    score,
    source: 'organic' as PatternSourceKind,
  };

  const classified: ClassifiedRecord[] = [];
  pushClassified(classified, {
    ...base,
    classify: classifyHook,
    patternType: 'hook_formula',
    text: readOptionalString(undefined, data.hookUsed),
  });
  pushClassified(classified, {
    ...base,
    classify: classifyContentStructure,
    patternType: 'content_structure',
    text: readOptionalString(undefined, data.promptUsed),
  });
  return classified;
}

function humanizeFormula(classifiedType: string): string {
  return classifiedType.replace(/_/g, ' ');
}

function groupSource(
  sources: readonly PatternSourceKind[],
): 'ad' | 'both' | 'organic' {
  if (sources.includes('ad') && sources.includes('organic')) {
    return 'both';
  }
  return sources[0] ?? 'ad';
}

export function buildPatternPayloads(
  groups: Iterable<PatternGroupState>,
  now: Date,
): PatternUpsertPayload[] {
  const publicValidUntil = new Date(now.getTime() + PUBLIC_PATTERN_TTL_MS);
  const privateValidUntil = new Date(now.getTime() + PRIVATE_PATTERN_TTL_MS);
  const payloads: PatternUpsertPayload[] = [];

  for (const group of groups) {
    if (group.sampleSize <= 0) {
      continue;
    }

    const avgPerformanceScore = Math.round(group.scoreSum / group.sampleSize);
    const examples = group.examples.map((example) => ({
      platform: example.platform,
      score: example.score,
      source: example.source,
      text: example.text,
    }));
    const industry = group.industry || undefined;
    const platform = group.platform || undefined;
    const label = humanizeFormula(group.classifiedType);

    if (group.orgIds.length >= PATTERN_EXTRACTION_MIN_ORGS_FOR_PUBLIC) {
      payloads.push({
        avgPerformanceScore,
        computedAt: now,
        description: `High-performing ${label} pattern`,
        examples,
        formula: group.classifiedType,
        industry,
        isDeleted: false,
        label,
        patternType: group.patternType,
        platform,
        sampleSize: group.sampleSize,
        scope: 'public',
        source: 'both',
        validUntil: publicValidUntil,
      });
    }

    if (group.orgIds.length === 1) {
      payloads.push({
        avgPerformanceScore,
        computedAt: now,
        description: `Private high-performing ${label} pattern`,
        examples,
        formula: group.classifiedType,
        industry,
        isDeleted: false,
        label,
        organization: group.orgIds[0],
        organizationId: group.orgIds[0],
        patternType: group.patternType,
        platform,
        sampleSize: group.sampleSize,
        scope: 'private',
        source: groupSource(group.sources),
        validUntil: privateValidUntil,
      });
    }
  }

  return payloads;
}

export function toUpsertInput(
  payload: PatternUpsertPayload,
): Record<string, unknown> {
  const record: Record<string, unknown> = {
    avgPerformanceScore: payload.avgPerformanceScore,
    computedAt: payload.computedAt,
    description: payload.description,
    examples: payload.examples,
    formula: payload.formula,
    isDeleted: payload.isDeleted,
    label: payload.label,
    patternType: payload.patternType,
    sampleSize: payload.sampleSize,
    scope: payload.scope,
    source: payload.source,
    validUntil: payload.validUntil,
  };
  if (payload.industry) {
    record.industry = payload.industry;
  }
  if (payload.organization) {
    record.organization = payload.organization;
  }
  if (payload.organizationId) {
    record.organizationId = payload.organizationId;
  }
  if (payload.platform) {
    record.platform = payload.platform;
  }
  return record;
}

export function serializeGroups(
  groups: Map<string, PatternGroupState>,
): Record<string, unknown> {
  return {
    groups: [...groups.values()],
  };
}

function isPatternSourceKind(value: unknown): value is PatternSourceKind {
  return value === 'ad' || value === 'organic';
}

function isPatternType(value: unknown): value is PatternType {
  return (
    value === 'hook_formula' ||
    value === 'cta_formula' ||
    value === 'content_structure' ||
    value === 'caption_formula' ||
    value === 'visual_style'
  );
}

function parseExample(value: unknown): PatternExample | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.orgId !== 'string' ||
    typeof record.platform !== 'string' ||
    typeof record.score !== 'number' ||
    !isPatternSourceKind(record.source) ||
    typeof record.text !== 'string'
  ) {
    return null;
  }
  return {
    orgId: record.orgId,
    platform: record.platform,
    score: record.score,
    source: record.source,
    text: record.text,
  };
}

function parseGroup(value: unknown): PatternGroupState | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.classifiedType !== 'string' ||
    typeof record.industry !== 'string' ||
    !isPatternType(record.patternType) ||
    typeof record.platform !== 'string' ||
    typeof record.sampleSize !== 'number' ||
    typeof record.scoreSum !== 'number' ||
    !Array.isArray(record.examples) ||
    !Array.isArray(record.orgIds) ||
    !Array.isArray(record.sources)
  ) {
    return null;
  }

  const examples = record.examples
    .map(parseExample)
    .filter((example): example is PatternExample => example !== null);
  const orgIds = record.orgIds.filter(
    (orgId): orgId is string => typeof orgId === 'string',
  );
  const sources = record.sources.filter(isPatternSourceKind);

  return {
    classifiedType: record.classifiedType,
    examples,
    industry: record.industry,
    orgIds,
    patternType: record.patternType,
    platform: record.platform,
    sampleSize: record.sampleSize,
    scoreSum: record.scoreSum,
    sources,
  };
}

export function deserializeGroups(
  data: Record<string, unknown> | null | undefined,
): Map<string, PatternGroupState> {
  const groups = new Map<string, PatternGroupState>();
  const stored = data?.groups;
  if (!Array.isArray(stored)) {
    return groups;
  }
  for (const value of stored) {
    const group = parseGroup(value);
    if (!group) {
      continue;
    }
    groups.set(
      patternGroupKey(
        group.platform,
        group.industry,
        group.classifiedType,
        group.patternType,
      ),
      group,
    );
  }
  return groups;
}

export function advanceCursor(
  rows: readonly { id: string; updatedAt: Date }[],
  previous: PatternExtractionCursor | null,
): PatternExtractionCursor | null {
  const lastRow = rows[rows.length - 1];
  if (!lastRow) {
    return previous;
  }
  return { measuredAt: lastRow.updatedAt, sourceId: lastRow.id };
}
