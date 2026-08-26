import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '../../execution/engine';
import type { ExecutableNode } from '../../types';
import type { ExecutorInput } from '../base-executor';
import {
  TalkingHeadScriptExecutor,
  type TalkingHeadScriptGenerationRequest,
  type TalkingHeadScriptResolver,
} from './talking-head-script-executor';

function makeNode(
  configOverrides: Record<string, unknown> = {},
): ExecutableNode {
  return {
    config: {
      clipCount: 5,
      durationSeconds: 30,
      language: 'en',
      productContext: 'A content operating system for founder-led brands',
      wordsPerSecond: 3.5,
      ...configOverrides,
    },
    id: 'script-1',
    inputs: [],
    label: 'Talking-head Script',
    type: 'talkingHeadScript',
  };
}

function makeContext(): ExecutionContext {
  return {
    organizationId: 'org-1',
    runId: 'run-1',
    userId: 'user-1',
    workflowId: 'wf-1',
  };
}

function makeInput(
  configOverrides: Record<string, unknown> = {},
  inputEntries: [string, unknown][] = [],
): ExecutorInput {
  return {
    context: makeContext(),
    inputs: new Map<string, unknown>(inputEntries),
    node: makeNode(configOverrides),
  };
}

function validDraft(segmentTexts?: string[]): string {
  const texts = segmentTexts ?? [
    'Your content should compound while you sleep',
    'Most teams lose momentum rebuilding the same process every week',
    'Genfeed turns your voice and strategy into one repeatable content system',
    'Plan create review and publish without dropping the thread',
    'Start your first content workflow today',
  ];

  return JSON.stringify({
    segments: texts.map((text, index) => ({
      clipIndex: index,
      purpose:
        index === 0 ? 'hook' : index === texts.length - 1 ? 'cta' : 'body',
      text,
    })),
  });
}

describe('TalkingHeadScriptExecutor', () => {
  let executor: TalkingHeadScriptExecutor;

  beforeEach(() => {
    executor = new TalkingHeadScriptExecutor();
  });

  it('rejects a duration that cannot fit coherent segments with actionable guidance', async () => {
    const resolver = vi.fn<TalkingHeadScriptResolver>();
    executor.setResolver(resolver);

    await expect(
      executor.execute(makeInput({ clipCount: 5, durationSeconds: 2 })),
    ).rejects.toThrow(
      'Increase duration to at least 4.286 seconds, reduce clipCount, or increase wordsPerSecond',
    );
    expect(resolver).not.toHaveBeenCalled();
  });

  it('rejects invalid pacing and clip counts before generation', () => {
    const pacing = executor.validate(makeNode({ wordsPerSecond: 0 }));
    const clips = executor.validate(makeNode({ clipCount: 1 }));

    expect(pacing.valid).toBe(false);
    expect(pacing.errors).toContain('wordsPerSecond must be between 1 and 6');
    expect(clips.valid).toBe(false);
    expect(clips.errors).toContain(
      'clipCount must be an integer between 2 and 20',
    );
  });

  it('builds deterministic per-clip budgets and emits a typed timed contract', async () => {
    const resolver = vi
      .fn<TalkingHeadScriptResolver>()
      .mockResolvedValue(validDraft());
    executor.setResolver(resolver);

    const result = await executor.execute(
      makeInput({}, [
        ['brandVoice', 'Direct, practical, and anti-hype'],
        [
          'harnessContext',
          { audience: ['solo founders'], bannedPhrases: ['game-changing'] },
        ],
      ]),
    );
    const output = result.data as {
      clipCount: number;
      fullText: string;
      script: {
        clipCount: number;
        language: string;
        segments: Array<{
          actualWordCount: number;
          clipIndex: number;
          purpose: string;
          targetDurationSeconds: number;
          targetWordCount: number;
          text: string;
        }>;
        totalDurationSeconds: number;
        totalTargetWordCount: number;
        totalWordCount: number;
        wordsPerSecond: number;
      };
      segments: unknown[];
      totalDurationSeconds: number;
      totalTargetWordCount: number;
      totalWordCount: number;
      wordsPerSecond: number;
    };

    expect(resolver).toHaveBeenCalledWith(
      expect.objectContaining({
        brandVoice: 'Direct, practical, and anti-hype',
        harnessContext: JSON.stringify({
          audience: ['solo founders'],
          bannedPhrases: ['game-changing'],
        }),
        language: 'en',
        productContext: 'A content operating system for founder-led brands',
        totalDurationSeconds: 30,
        totalTargetWordCount: 105,
        wordsPerSecond: 3.5,
      }),
    );
    expect(output.script.segments).toHaveLength(5);
    expect(output.script.clipCount).toBe(5);
    expect(output.script.segments.map((segment) => segment.purpose)).toEqual([
      'hook',
      'body',
      'body',
      'body',
      'cta',
    ]);
    expect(
      output.script.segments.reduce(
        (total, segment) => total + segment.targetDurationSeconds,
        0,
      ),
    ).toBe(30);
    expect(
      output.script.segments.every(
        (segment) => segment.actualWordCount <= segment.targetWordCount,
      ),
    ).toBe(true);
    expect(output.script.totalTargetWordCount).toBe(105);
    expect(output.script.totalWordCount).toBe(
      output.script.segments.reduce(
        (total, segment) => total + segment.actualWordCount,
        0,
      ),
    );
    expect(output.segments).toBe(output.script.segments);
    expect(output.clipCount).toBe(5);
    expect(output.fullText).toContain('\n\n');
    expect(output.totalDurationSeconds).toBe(30);
    expect(output.totalTargetWordCount).toBe(105);
    expect(output.totalWordCount).toBe(output.script.totalWordCount);
    expect(output.wordsPerSecond).toBe(3.5);
  });

  it('uses connected timing and product values ahead of node defaults', async () => {
    const resolver = vi
      .fn<TalkingHeadScriptResolver>()
      .mockResolvedValue(
        validDraft([
          'Stop losing your best ideas',
          'Capture the insight once',
          'Turn it into a repeatable system',
          'Start building your workflow today',
        ]),
      );
    executor.setResolver(resolver);

    const result = await executor.execute(
      makeInput({}, [
        ['productContext', 'A workflow memory product'],
        ['durationSeconds', 20],
        ['clipCount', 4],
        ['wordsPerSecond', 3],
        ['language', 'en-GB'],
      ]),
    );

    expect(resolver).toHaveBeenCalledWith(
      expect.objectContaining({
        language: 'en-GB',
        productContext: 'A workflow memory product',
        totalDurationSeconds: 20,
        totalTargetWordCount: 60,
        wordsPerSecond: 3,
      }),
    );
    expect(
      (result.data as { script: { segments: unknown[] } }).script.segments,
    ).toHaveLength(4);
  });

  it('retries once with the validation error when a segment exceeds its WPS budget', async () => {
    const oversizedHook = Array.from(
      { length: 30 },
      (_, index) => `word${index + 1}`,
    ).join(' ');
    const resolver = vi
      .fn<TalkingHeadScriptResolver>()
      .mockResolvedValueOnce(
        validDraft([
          oversizedHook,
          'Keep the process moving with one source of truth',
          'Shape every idea around your actual brand voice',
          'Review the work before anything leaves your workspace',
          'Build your first workflow today',
        ]),
      )
      .mockResolvedValueOnce(validDraft());
    executor.setResolver(resolver);

    await executor.execute(makeInput());

    expect(resolver).toHaveBeenCalledTimes(2);
    const retryRequest = resolver.mock.calls[1]?.[0] as
      | TalkingHeadScriptGenerationRequest
      | undefined;
    expect(retryRequest?.validationError).toContain(
      'Segment 0 has 30 words but its 6-second budget at 3.5 wps allows 21',
    );
    expect(retryRequest?.validationError).toContain(
      'Shorten it by at least 9 words',
    );
  });

  it('strictly rejects unknown fields and reports the final corrective action', async () => {
    const invalid = JSON.stringify({
      commentary: 'Here is your script',
      segments: JSON.parse(validDraft()).segments,
    });
    const resolver = vi
      .fn<TalkingHeadScriptResolver>()
      .mockResolvedValue(invalid);
    executor.setResolver(resolver);

    await expect(executor.execute(makeInput())).rejects.toThrow(
      'Talking-head script generation failed after 2 attempts: Unexpected field "commentary" at script',
    );
    expect(resolver).toHaveBeenCalledTimes(2);
  });

  it('strictly enforces hook first, body middle, and CTA last', async () => {
    const resolver = vi.fn<TalkingHeadScriptResolver>().mockResolvedValue(
      JSON.stringify({
        segments: JSON.parse(validDraft()).segments.map(
          (segment: Record<string, unknown>, index: number) => ({
            ...segment,
            purpose: index === 4 ? 'body' : segment.purpose,
          }),
        ),
      }),
    );
    executor.setResolver(resolver);

    await expect(executor.execute(makeInput())).rejects.toThrow(
      'Segment 4 must have purpose "cta"',
    );
  });

  it('charges three credits for full-script generation', () => {
    expect(executor.estimateCost(makeNode())).toBe(3);
  });
});
