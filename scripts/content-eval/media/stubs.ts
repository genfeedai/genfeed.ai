import { createHash } from 'node:crypto';
import type {
  EvalDispatcher,
  EvalMessage,
  EvalStructuredRequest,
  EvalStructuredResponse,
} from '../contracts';
import { canonicalJson } from '../provenance';
import { estimateTokens } from '../spend';
import type { RegistryMediaModel } from './contestants';
import type { JudgeVerdict, Medium } from './contracts';
import type {
  MediaGenerationPort,
  MediaGenerationRequest,
  MediaGenerationResult,
} from './generation';
import { buildGenerationBody, settingsFromBody } from './generation';
import type { FrameSamplerPort } from './judge';
import type { MediaProbePort } from './readiness';

/**
 * Deterministic stand-ins so `--suite=media-ladder --dispatcher=stub` runs end
 * to end in CI with no network: generation returns a synthetic artifact URL
 * carrying the requested size, the probe reads that size back, and the judge
 * scores each answer from a hash of its URL. It exercises the harness — shuffle,
 * panel, voids, Elo, report — and never measures a model.
 */

const STUB_ARTIFACT_HOST = 'https://stub.content-eval.invalid';

/** Mirrors the bench Season One registry, so a stub ladder has its shape. */
export const STUB_REGISTRY: Readonly<Record<Medium, RegistryMediaModel[]>> = {
  image: [
    {
      cost: 4,
      isActive: true,
      isLegacy: false,
      key: 'bytedance/seedream-5-pro',
      label: 'Seedream 5 Pro',
    },
    {
      cost: 6,
      isActive: true,
      isLegacy: false,
      key: 'google/nano-banana-2',
      label: 'Nano Banana 2',
    },
    {
      cost: 5,
      isActive: true,
      isLegacy: false,
      key: 'black-forest-labs/flux-2-pro',
      label: 'FLUX.2 Pro',
    },
    {
      cost: 8,
      isActive: true,
      isLegacy: false,
      key: 'openai/gpt-image-2',
      label: 'GPT Image 2',
    },
    {
      cost: 1,
      isActive: true,
      isLegacy: false,
      key: 'black-forest-labs/flux-schnell',
      label: 'FLUX Schnell',
    },
  ],
  video: [
    {
      cost: 40,
      isActive: true,
      isLegacy: false,
      key: 'google/veo-3-fast',
      label: 'Veo 3 Fast',
    },
    {
      cost: 30,
      isActive: true,
      isLegacy: false,
      key: 'kwaivgi/kling-v2.1',
      label: 'Kling 2.1',
    },
    {
      cost: 20,
      isActive: true,
      isLegacy: false,
      key: 'prunaai/p-video',
      label: 'P-Video',
    },
  ],
};

function unit(text: string): number {
  return (
    createHash('sha256').update(text).digest().readUInt32BE(0) / 0x1_0000_0000
  );
}

export class StubMediaGeneration implements MediaGenerationPort {
  async generate(
    request: MediaGenerationRequest,
  ): Promise<MediaGenerationResult> {
    const settings = settingsFromBody(buildGenerationBody(request));
    const id = `${request.contestant.contestant.id}-${request.seed ?? 0}`;
    return {
      costEvidence: 'estimated',
      creditsCharged: request.contestant.creditsPerOutput,
      error: null,
      fetchUrl: `${STUB_ARTIFACT_HOST}/${encodeURIComponent(id)}/${request.width}x${request.height}${request.durationSeconds === null ? '' : `x${request.durationSeconds}s`}.${request.medium === 'image' ? 'png' : 'mp4'}`,
      ingredientId: `stub-${id}`,
      latencyMs: Math.round(unit(id) * 1000),
      settings,
      status: 'generated',
    };
  }
}

export class StubMediaProbe implements MediaProbePort {
  async probe(url: string, medium: Medium) {
    const [, width, height, seconds] =
      /\/(\d+)x(\d+)(?:x(\d+)s)?\.(?:png|mp4)$/.exec(url) ?? [];
    return {
      audioCodec: null,
      container: medium === 'image' ? 'png' : 'mp4',
      durationSeconds: seconds ? Number(seconds) : null,
      frameRate: medium === 'video' ? 24 : null,
      height: height ? Number(height) : null,
      kind: medium,
      probedAt: '2026-01-01T00:00:00.000Z',
      sizeBytes: 100_000,
      videoCodec: medium === 'video' ? 'h264' : null,
      width: width ? Number(width) : null,
    };
  }
}

export class StubFrameSampler implements FrameSamplerPort {
  async sample(url: string): Promise<string[]> {
    return [url];
  }
}

function imageUrls(message: EvalMessage | undefined): string[] {
  if (!message || typeof message.content === 'string') return [];
  return message.content.flatMap((part) =>
    part.type === 'image_url' ? [part.image_url.url] : [],
  );
}

function answerSplit(message: EvalMessage | undefined): [string[], string[]] {
  if (!message || typeof message.content === 'string') return [[], []];
  const a: string[] = [];
  const b: string[] = [];
  let side: 'a' | 'b' | null = null;
  for (const part of message.content) {
    if (part.type === 'text' && part.text === 'Answer A:') side = 'a';
    else if (part.type === 'text' && part.text === 'Answer B:') side = 'b';
    else if (part.type === 'image_url' && side) {
      (side === 'a' ? a : b).push(part.image_url.url);
    }
  }
  return [a, b];
}

function rubricLines(message: EvalMessage | undefined): number {
  const content = message?.content ?? '';
  const text =
    typeof content === 'string'
      ? content
      : content
          .map((part) => (part.type === 'text' ? part.text : ''))
          .join('\n');
  const block =
    /Rubric \(index\. line\):\n([\s\S]*?)\n\n/.exec(text)?.[1] ?? '';
  return block.split('\n').filter((line) => /^\d+\. /.test(line)).length;
}

/** Answer quality from its URLs only; each judge adds a small per-model skew. */
function stubVerdict(model: string, messages: EvalMessage[]): JudgeVerdict {
  const user = messages.find((message) => message.role === 'user');
  const [a, b] = answerSplit(user);
  const lines = rubricLines(user);
  const quality = (urls: string[]) =>
    Math.min(1, Math.max(0, unit(urls.join('|')) + (unit(model) - 0.5) * 0.1));
  const side = (value: number) => ({
    adherence: Array.from({ length: lines }, (_, line) => ({
      line,
      yesProbability: Math.round(value * 100) / 100,
    })),
    brandFit: null,
    craft: Math.round(value * 100) / 100,
  });
  const qa = quality(a);
  const qb = quality(b);
  return {
    a: side(qa),
    b: side(qb),
    choice: Math.abs(qa - qb) < 0.02 ? 'tie' : qa > qb ? 'a' : 'b',
    rationale: `Stub panel: compared ${imageUrls(user).length} frames by hash quality.`,
  };
}

/** Stub dispatcher for the media judge schema; same contract as the live one. */
export function createMediaStubDispatcher(): EvalDispatcher {
  return {
    async close() {},
    async completeStructured<TResult>(
      request: EvalStructuredRequest<TResult>,
    ): Promise<EvalStructuredResponse<TResult>> {
      const value = request.schema.parse(
        stubVerdict(request.model, request.messages),
      );
      const promptTokens = estimateTokens(canonicalJson(request.messages));
      const completionTokens = estimateTokens(canonicalJson(value));
      return {
        latencyMs: completionTokens,
        modelVersion: `${request.model}@stub`,
        provider: 'stub',
        usage: {
          completionTokens,
          costUsd: (promptTokens + completionTokens) * 0.000_001,
          promptTokens,
        },
        value,
      };
    },
    kind: 'stub',
  };
}
