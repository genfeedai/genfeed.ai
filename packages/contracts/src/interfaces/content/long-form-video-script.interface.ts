/**
 * Structured script for a long-form video built from a voice note (#8218).
 *
 * The agent writes it from a transcript, the creator edits and approves it,
 * and every later step (quote, avatar chunks, timeline assembly) reads the
 * same typed beats instead of free text.
 */

export const LONG_FORM_VIDEO_BEAT_VISUAL_TYPES = [
  'presenter',
  'b-roll',
  'motion-graphic',
  'text-card',
] as const;

export type LongFormVideoBeatVisualType =
  (typeof LONG_FORM_VIDEO_BEAT_VISUAL_TYPES)[number];

export function isLongFormVideoBeatVisualType(
  value: unknown,
): value is LongFormVideoBeatVisualType {
  return LONG_FORM_VIDEO_BEAT_VISUAL_TYPES.some((type) => type === value);
}

export const LONG_FORM_VIDEO_SCRIPT_LIMITS = {
  /** A beat's narration must fit one avatar chunk and one speech request. */
  maxBeatDurationSeconds: 300,
  maxBeatNarrationCharacters: 2_000,
  maxBeats: 80,
  maxTargetDurationSeconds: 1_800,
  maxTitleCharacters: 200,
  minTargetDurationSeconds: 15,
} as const;

export interface ILongFormVideoBeat {
  id: string;
  title: string;
  /** The spoken line. Presenter beats show the avatar; other beats cut away while it plays. */
  narration: string;
  visualType: LongFormVideoBeatVisualType;
  /** What the cutaway shows. Ignored for presenter beats. */
  visualBrief?: string;
  targetDurationSeconds: number;
}

export interface ILongFormVideoScript {
  title: string;
  hook: string;
  /** BCP 47 tag of the narration language. */
  language: string;
  targetDurationSeconds: number;
  beats: ILongFormVideoBeat[];
  /** Starts at 1 and increases on every edit, so approval binds to one revision. */
  revision: number;
}

export interface ILongFormVideoScriptIssue {
  path: string;
  message: string;
}

export type LongFormVideoScriptParseResult =
  | { isValid: true; script: ILongFormVideoScript }
  | { isValid: false; issues: ILongFormVideoScriptIssue[] };

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function joinPath(path: string, key: string): string {
  return path ? `${path}.${key}` : key;
}

function readText(
  record: UnknownRecord,
  key: string,
  path: string,
  issues: ILongFormVideoScriptIssue[],
  maxCharacters?: number,
): string {
  const value = record[key];
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length === 0) {
    issues.push({ message: 'Required', path: joinPath(path, key) });
  } else if (maxCharacters !== undefined && text.length > maxCharacters) {
    issues.push({
      message: `Must be at most ${maxCharacters} characters`,
      path: joinPath(path, key),
    });
  }
  return text;
}

function readSeconds(
  record: UnknownRecord,
  key: string,
  path: string,
  issues: ILongFormVideoScriptIssue[],
  min: number,
  max: number,
): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push({ message: 'Must be a number', path: joinPath(path, key) });
    return 0;
  }
  if (value < min || value > max) {
    issues.push({
      message: `Must be between ${min} and ${max} seconds`,
      path: joinPath(path, key),
    });
  }
  return value;
}

function readBeat(
  value: unknown,
  index: number,
  seenIds: Set<string>,
  issues: ILongFormVideoScriptIssue[],
): ILongFormVideoBeat | undefined {
  const path = `beats[${index}]`;
  if (!isRecord(value)) {
    issues.push({ message: 'Must be an object', path });
    return undefined;
  }

  const id = readText(value, 'id', path, issues);
  if (id && seenIds.has(id)) {
    issues.push({ message: 'Must be unique', path: joinPath(path, 'id') });
  }
  seenIds.add(id);

  const visualType = value.visualType;
  if (!isLongFormVideoBeatVisualType(visualType)) {
    issues.push({
      message: `Must be one of ${LONG_FORM_VIDEO_BEAT_VISUAL_TYPES.join(', ')}`,
      path: joinPath(path, 'visualType'),
    });
  }

  const title = readText(value, 'title', path, issues);
  const narration = readText(
    value,
    'narration',
    path,
    issues,
    LONG_FORM_VIDEO_SCRIPT_LIMITS.maxBeatNarrationCharacters,
  );
  const targetDurationSeconds = readSeconds(
    value,
    'targetDurationSeconds',
    path,
    issues,
    1,
    LONG_FORM_VIDEO_SCRIPT_LIMITS.maxBeatDurationSeconds,
  );
  const visualBrief =
    typeof value.visualBrief === 'string' ? value.visualBrief.trim() : '';

  if (
    isLongFormVideoBeatVisualType(visualType) &&
    visualType !== 'presenter' &&
    visualBrief.length === 0
  ) {
    issues.push({
      message: 'Required when the beat is not a presenter beat',
      path: joinPath(path, 'visualBrief'),
    });
  }

  if (!isLongFormVideoBeatVisualType(visualType)) return undefined;

  return {
    id,
    narration,
    targetDurationSeconds,
    title,
    visualType,
    ...(visualBrief ? { visualBrief } : {}),
  };
}

/**
 * Validates an untrusted script (an agent tool result or an edit from the
 * creator) and returns a normalized copy, or every issue found.
 */
export function parseLongFormVideoScript(
  value: unknown,
): LongFormVideoScriptParseResult {
  const issues: ILongFormVideoScriptIssue[] = [];
  if (!isRecord(value)) {
    return {
      isValid: false,
      issues: [{ message: 'Must be an object', path: '' }],
    };
  }

  const title = readText(
    value,
    'title',
    '',
    issues,
    LONG_FORM_VIDEO_SCRIPT_LIMITS.maxTitleCharacters,
  );
  const hook = readText(value, 'hook', '', issues);
  const language = readText(value, 'language', '', issues);
  const targetDurationSeconds = readSeconds(
    value,
    'targetDurationSeconds',
    '',
    issues,
    LONG_FORM_VIDEO_SCRIPT_LIMITS.minTargetDurationSeconds,
    LONG_FORM_VIDEO_SCRIPT_LIMITS.maxTargetDurationSeconds,
  );

  const revision = value.revision;
  if (
    typeof revision !== 'number' ||
    !Number.isInteger(revision) ||
    revision < 1
  ) {
    issues.push({
      message: 'Must be an integer of at least 1',
      path: 'revision',
    });
  }

  const rawBeats = value.beats;
  const beats: ILongFormVideoBeat[] = [];
  if (!Array.isArray(rawBeats) || rawBeats.length === 0) {
    issues.push({ message: 'At least one beat is required', path: 'beats' });
  } else if (rawBeats.length > LONG_FORM_VIDEO_SCRIPT_LIMITS.maxBeats) {
    issues.push({
      message: `At most ${LONG_FORM_VIDEO_SCRIPT_LIMITS.maxBeats} beats`,
      path: 'beats',
    });
  } else {
    const seenIds = new Set<string>();
    rawBeats.forEach((rawBeat: unknown, index: number) => {
      const beat = readBeat(rawBeat, index, seenIds, issues);
      if (beat) beats.push(beat);
    });
  }

  if (issues.length > 0 || typeof revision !== 'number') {
    return { isValid: false, issues };
  }

  return {
    isValid: true,
    script: { beats, hook, language, revision, targetDurationSeconds, title },
  };
}

/** The full spoken text in beat order, one paragraph per beat. */
export function getLongFormVideoScriptNarration(
  script: ILongFormVideoScript,
): string {
  return script.beats.map((beat) => beat.narration).join('\n\n');
}

/** Sum of the beat durations, to compare against the script's target. */
export function sumLongFormVideoBeatSeconds(
  script: ILongFormVideoScript,
): number {
  return script.beats.reduce(
    (total, beat) => total + beat.targetDurationSeconds,
    0,
  );
}
