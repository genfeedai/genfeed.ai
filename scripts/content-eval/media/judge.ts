import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  BrandKit,
  JudgeSpec,
  JudgeVerdict,
  MediaTask,
  Medium,
} from './contracts';
import { judgeVerdictSchema, MEDIA_RUBRIC_VERSION } from './contracts';
import { renderBrandKit } from './tasks';

/**
 * Vision judge for one shuffled pair. The judge sees only the task text, the
 * rubric, the brand reference when the task has one, and two unlabelled
 * answers as A and B — never a provider, model name, or whether a compiler
 * was in the path (bench DESIGN.md "Judging").
 *
 * Dimensions, in the order the rubric weighs them:
 * - adherence: VQAScore-style probability that each rubric line holds;
 * - brand fit: kit / harness evaluationCriteria, null when the task has none;
 * - craft, last.
 */

export type JudgeContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface JudgeMessage {
  role: 'system' | 'user';
  content: string | JudgeContentPart[];
}

export interface JudgeAnswerVisuals {
  /** Image URLs, or keyframe data URLs for video, in display order. */
  frames: readonly string[];
}

export interface VisionJudgeRequest {
  /** Match id; recorded as the ledger row of the judge call. */
  rowId: string;
  judge: JudgeSpec;
  messages: JudgeMessage[];
  rubricLines: number;
  schemaName: string;
}

export interface VisionJudgeResponse {
  callId: string | null;
  verdict: JudgeVerdict;
  costUsd: number | null;
  latencyMs: number;
}

/** Adapter over the harness's metered structured call (LlmDispatcherService). */
export interface VisionJudgePort {
  judge(
    request: VisionJudgeRequest,
    signal: AbortSignal,
  ): Promise<VisionJudgeResponse>;
}

export const JUDGE_SCHEMA_NAME = 'media_pair_verdict';

const SYSTEM_PROMPT = [
  'You are one judge on a blind panel comparing two generated answers, A and B, to the same creative task.',
  'You are told nothing about who or what produced either answer. Position carries no meaning; do not favour A or B for its position, and do not favour the more elaborate-looking answer for that reason alone.',
  'Judge the rubric lines in the order given. A beautiful answer that gets an earlier line wrong loses to a plainer one that gets it right.',
  'For every rubric line and each answer, give yesProbability: your probability (0 to 1) that the answer satisfies that line.',
  'brandFit (0 to 1) scores fidelity to the supplied brand reference and criteria; return null for both answers when no brand reference is supplied.',
  'craft (0 to 1) scores execution quality once the rubric is judged.',
  'choice is "a", "b", or "tie" when you cannot separate them on the rubric. rationale is two to four sentences naming the rubric lines that decided it.',
].join('\n');

export function buildJudgeMessages(input: {
  task: MediaTask;
  kit: BrandKit | null;
  a: JudgeAnswerVisuals;
  b: JudgeAnswerVisuals;
}): JudgeMessage[] {
  const { task } = input.task;
  const rubric = task.rubric
    .map((line, index) => `${index}. ${line}`)
    .join('\n');
  const brandLines: string[] = [];
  if (input.kit && task.referenceRoles.includes('brand-kit')) {
    brandLines.push(renderBrandKit(input.kit));
  }
  if (input.task.evaluationCriteria.length > 0) {
    brandLines.push(
      `Brand criteria:\n${input.task.evaluationCriteria.map((line) => `- ${line}`).join('\n')}`,
    );
  }
  const frameNote =
    task.medium === 'video'
      ? 'Each video answer is shown as evenly spaced keyframes in time order.'
      : task.outputSpec.count > 1
        ? `Each answer has ${task.outputSpec.count} images, judged as a set.`
        : 'Each answer is one image.';

  const content: JudgeContentPart[] = [
    {
      text: [
        `Task (${task.medium}): ${task.title}`,
        `Prompt given to both:\n${task.prompt}`,
        `Rubric (index. line):\n${rubric}`,
        brandLines.length > 0
          ? `Brand reference:\n${brandLines.join('\n\n')}`
          : 'Brand reference: none.',
        frameNote,
        `Rubric version: ${MEDIA_RUBRIC_VERSION}.`,
      ].join('\n\n'),
      type: 'text',
    },
    { text: 'Answer A:', type: 'text' },
    ...input.a.frames.map(toImagePart),
    { text: 'Answer B:', type: 'text' },
    ...input.b.frames.map(toImagePart),
  ];

  return [
    { content: SYSTEM_PROMPT, role: 'system' },
    { content, role: 'user' },
  ];
}

function toImagePart(url: string): JudgeContentPart {
  return { image_url: { url }, type: 'image_url' };
}

/**
 * Rejects verdicts that skip or invent rubric lines, so a vote never scores
 * adherence on a different rubric than the task's.
 */
export function assertVerdictCoversRubric(
  verdict: JudgeVerdict,
  rubricLines: number,
): JudgeVerdict {
  const parsed = judgeVerdictSchema.parse(verdict);
  for (const side of ['a', 'b'] as const) {
    const lines = parsed[side].adherence
      .map((score) => score.line)
      .sort((one, two) => one - two);
    const expected = Array.from({ length: rubricLines }, (_, index) => index);
    if (
      lines.length !== expected.length ||
      lines.some((line, index) => line !== expected[index])
    ) {
      throw new Error(
        `Judge verdict for ${side.toUpperCase()} scored rubric lines [${lines.join(',')}], expected 0..${rubricLines - 1}`,
      );
    }
  }
  return parsed;
}

/** Mean adherence across rubric lines: the answer-level adherence score. */
export function meanAdherence(verdict: JudgeVerdict, side: 'a' | 'b'): number {
  const scores = verdict[side].adherence.map((score) => score.yesProbability);
  return scores.length === 0
    ? 0
    : scores.reduce((sum, value) => sum + value, 0) / scores.length;
}

export interface FrameSamplerPort {
  sample(url: string, medium: Medium, signal: AbortSignal): Promise<string[]>;
}

const execFileAsync = promisify(execFile);

export const VIDEO_KEYFRAMES = 6;

/**
 * Images pass through by URL. Videos become evenly spaced JPEG keyframes as
 * data URLs, since vision judges take images, not clips.
 */
export class FfmpegFrameSampler implements FrameSamplerPort {
  constructor(
    private readonly ffmpeg = 'ffmpeg',
    private readonly ffprobe = 'ffprobe',
  ) {}

  async sample(
    url: string,
    medium: Medium,
    signal: AbortSignal,
  ): Promise<string[]> {
    if (medium === 'image') return [url];
    const { stdout } = await execFileAsync(
      this.ffprobe,
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        url,
      ],
      { signal },
    );
    const duration = Number(stdout.trim());
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error('video duration could not be read for keyframes');
    }
    const frames: string[] = [];
    for (let index = 0; index < VIDEO_KEYFRAMES; index += 1) {
      const at = (duration * (index + 0.5)) / VIDEO_KEYFRAMES;
      const { stdout: jpeg } = await execFileAsync(
        this.ffmpeg,
        [
          '-v',
          'error',
          '-ss',
          at.toFixed(3),
          '-i',
          url,
          '-frames:v',
          '1',
          '-vf',
          'scale=768:-2',
          '-f',
          'image2pipe',
          '-vcodec',
          'mjpeg',
          'pipe:1',
        ],
        { encoding: 'buffer', maxBuffer: 16 * 1024 * 1024, signal },
      );
      frames.push(`data:image/jpeg;base64,${jpeg.toString('base64')}`);
    }
    return frames;
  }
}
