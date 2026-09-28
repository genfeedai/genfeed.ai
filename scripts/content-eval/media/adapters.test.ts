import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaContestant, MediaTask } from './contracts';
import { mediaTaskSchema } from './contracts';
import {
  buildGenerationBody,
  type MediaGenerationRequest,
  ProductApiMediaGeneration,
} from './generation';
import { assertVerdictCoversRubric, buildJudgeMessages } from './judge';
import {
  assessReadiness,
  checkTaskOutputSpec,
  normalizeFfprobe,
} from './readiness';
import { loadBenchTasks, loadKelderBrandKit } from './tasks';

const RAW: MediaContestant = {
  contestant: {
    addedAt: '2026-09-26T00:00:00.000Z',
    id: 'black-forest-labs.flux-schnell',
    isCompiled: false,
    label: 'FLUX Schnell',
    mediums: ['image'],
    modelId: 'black-forest-labs/flux-schnell',
    provider: 'black-forest-labs',
    retiredAt: null,
  },
  creditsPerOutput: 1,
  family: 'black-forest-labs',
  pricing: { cost: 1, costPerUnit: null, minCost: null, pricingType: null },
  registryKey: 'black-forest-labs/flux-schnell',
  route: { kind: 'raw' },
};

const COMPILED: MediaContestant = {
  ...RAW,
  contestant: {
    ...RAW.contestant,
    id: 'genfeed-compiled.flux-schnell',
    isCompiled: true,
    provider: 'genfeed',
  },
  route: {
    compilerId: 'flux-schnell',
    compilerVersion: 1,
    fidelityMode: 'guided',
    kind: 'compiled',
    profileId: 'flux-schnell',
    profileVersion: 1,
  },
};

function request(
  overrides: Partial<MediaGenerationRequest> = {},
): MediaGenerationRequest {
  return {
    brandId: 'brand-1',
    compiledFidelity: null,
    contestant: RAW,
    durationSeconds: null,
    height: 1024,
    medium: 'image',
    prompt: 'five apples',
    referenceIngredientIds: [],
    seed: 42,
    style: null,
    width: 1536,
    ...overrides,
  };
}

async function benchTask(id: string): Promise<MediaTask> {
  const tasks = await loadBenchTasks({ includeDrafts: true, medium: 'image' });
  const found = tasks.find(({ task }) => task.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

describe('buildGenerationBody', () => {
  it('sends the raw route with enhancement and branding off', () => {
    expect(buildGenerationBody(request())).toMatchObject({
      fidelityMode: 'off',
      harness: false,
      isBrandingEnabled: false,
      model: 'black-forest-labs/flux-schnell',
      seed: 42,
      text: 'five apples',
      waitForCompletion: true,
    });
  });

  it('sends the compiled route through the harness at its fidelity, with task overrides', () => {
    expect(
      buildGenerationBody(request({ contestant: COMPILED })),
    ).toMatchObject({
      fidelityMode: 'guided',
      harness: true,
      isBrandingEnabled: true,
    });
    expect(
      buildGenerationBody(
        request({
          compiledFidelity: 'off',
          contestant: COMPILED,
          style: 'kit',
        }),
      ),
    ).toMatchObject({ fidelityMode: 'off', style: 'kit' });
  });
});

describe('ProductApiMediaGeneration', () => {
  function fakeFetch(
    ingredient: Record<string, unknown>,
    balances: number[],
    status = 201,
  ): { fetchImpl: typeof fetch; calls: string[] } {
    const calls: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith('/credits/usage')) {
        return Response.json({
          data: { attributes: { currentBalance: balances.shift() } },
        });
      }
      return Response.json(
        status < 300
          ? { data: { attributes: ingredient, id: 'ing-1' } }
          : { message: 'Content policy violation' },
        { status },
      );
    }) as typeof fetch;
    return { calls, fetchImpl };
  }

  it('returns the generated artifact and the credits the balance moved by', async () => {
    const { calls, fetchImpl } = fakeFetch(
      { status: 'GENERATED', url: 'https://cdn.example/ing-1.jpg' },
      [100, 97],
    );
    const client = new ProductApiMediaGeneration({
      apiKey: 'test-key',
      apiUrl: 'https://api.genfeed.localhost/v1/',
      fetchImpl,
      now: () => 0,
    });
    const result = await client.generate(
      request(),
      new AbortController().signal,
    );
    expect(result).toMatchObject({
      costEvidence: 'reported',
      creditsCharged: 3,
      fetchUrl: 'https://cdn.example/ing-1.jpg',
      ingredientId: 'ing-1',
      status: 'generated',
    });
    expect(result.settings).not.toHaveProperty('brandId');
    expect(calls).toContain('https://api.genfeed.localhost/v1/images');
  });

  it('classifies a policy rejection as a refusal', async () => {
    const { fetchImpl } = fakeFetch({}, [100, 100], 400);
    const client = new ProductApiMediaGeneration({
      apiKey: 'test-key',
      apiUrl: 'https://api.genfeed.localhost/v1',
      fetchImpl,
    });
    const result = await client.generate(
      request(),
      new AbortController().signal,
    );
    expect(result.status).toBe('refused');
    expect(result.creditsCharged).toBe(0);
  });

  describe('background-only providers (Fal never resolves waitForCompletion)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    /** A `POST /images` that returns pending, then two GET polls: pending, then done. */
    function fakePendingFetch(): typeof fetch {
      const balances = [100, 100, 100, 97];
      let pollCalls = 0;
      return (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/credits/usage')) {
          return Response.json({
            data: { attributes: { currentBalance: balances.shift() } },
          });
        }
        if ((init?.method ?? 'GET') === 'POST') {
          return Response.json(
            { data: { attributes: { status: 'PROCESSING' }, id: 'ing-1' } },
            { status: 201 },
          );
        }
        // GET /images/ing-1 — the poll route.
        pollCalls += 1;
        if (pollCalls < 2) {
          return Response.json({
            data: { attributes: { status: 'PROCESSING' }, id: 'ing-1' },
          });
        }
        return Response.json({
          data: {
            attributes: {
              status: 'GENERATED',
              url: 'https://cdn.example/ing-1.jpg',
            },
            id: 'ing-1',
          },
        });
      }) as typeof fetch;
    }

    it('polls a pending ingredient to completion instead of failing it immediately', async () => {
      const fetchImpl = fakePendingFetch();
      const client = new ProductApiMediaGeneration({
        apiKey: 'test-key',
        apiUrl: 'https://api.genfeed.localhost/v1',
        fetchImpl,
      });
      const resultPromise = client.generate(
        request(),
        new AbortController().signal,
      );
      // Two 2s image-poll intervals must elapse before the second GET resolves it.
      await vi.advanceTimersByTimeAsync(5_000);
      const result = await resultPromise;
      expect(result).toMatchObject({
        fetchUrl: 'https://cdn.example/ing-1.jpg',
        status: 'generated',
      });
    });

    it('fails a generation that is still pending once the poll times out', async () => {
      const fetchImpl = (async (
        input: string | URL | Request,
        init?: RequestInit,
      ) => {
        const url = String(input);
        if (url.endsWith('/credits/usage')) {
          return Response.json({
            data: { attributes: { currentBalance: 100 } },
          });
        }
        if ((init?.method ?? 'GET') === 'POST') {
          return Response.json(
            { data: { attributes: { status: 'PROCESSING' }, id: 'ing-1' } },
            { status: 201 },
          );
        }
        // Never leaves PROCESSING.
        return Response.json({
          data: { attributes: { status: 'PROCESSING' }, id: 'ing-1' },
        });
      }) as typeof fetch;
      const client = new ProductApiMediaGeneration({
        apiKey: 'test-key',
        apiUrl: 'https://api.genfeed.localhost/v1',
        fetchImpl,
      });
      const resultPromise = client.generate(
        request(),
        new AbortController().signal,
      );
      // Past the 180s image poll ceiling.
      await vi.advanceTimersByTimeAsync(185_000);
      const result = await resultPromise;
      expect(result.status).toBe('failed');
      expect(result.error).toContain('still "PROCESSING"');
      expect(result.error).toContain('polling 180000ms');
    });

    it('retries a transient network error while polling instead of aborting the run', async () => {
      const balances = [100, 100, 100, 97];
      let pollCalls = 0;
      const fetchImpl = (async (
        input: string | URL | Request,
        init?: RequestInit,
      ) => {
        const url = String(input);
        if (url.endsWith('/credits/usage')) {
          return Response.json({
            data: { attributes: { currentBalance: balances.shift() } },
          });
        }
        if ((init?.method ?? 'GET') === 'POST') {
          return Response.json(
            { data: { attributes: { status: 'PROCESSING' }, id: 'ing-1' } },
            { status: 201 },
          );
        }
        // GET /images/ing-1 — first poll drops the connection, second succeeds.
        pollCalls += 1;
        if (pollCalls === 1) {
          throw new TypeError('fetch failed');
        }
        return Response.json({
          data: {
            attributes: {
              status: 'GENERATED',
              url: 'https://cdn.example/ing-1.jpg',
            },
            id: 'ing-1',
          },
        });
      }) as typeof fetch;
      const client = new ProductApiMediaGeneration({
        apiKey: 'test-key',
        apiUrl: 'https://api.genfeed.localhost/v1',
        fetchImpl,
      });
      const resultPromise = client.generate(
        request(),
        new AbortController().signal,
      );
      // Two 2s poll intervals: the failed attempt, then the successful retry.
      await vi.advanceTimersByTimeAsync(5_000);
      const result = await resultPromise;
      expect(result).toMatchObject({
        fetchUrl: 'https://cdn.example/ing-1.jpg',
        status: 'generated',
      });
    });

    it('returns a metered failure instead of throwing when polling never recovers from network errors', async () => {
      const balanceCalls: string[] = [];
      const fetchImpl = (async (
        input: string | URL | Request,
        init?: RequestInit,
      ) => {
        const url = String(input);
        if (url.endsWith('/credits/usage')) {
          balanceCalls.push(url);
          return Response.json({
            data: { attributes: { currentBalance: 100 } },
          });
        }
        if ((init?.method ?? 'GET') === 'POST') {
          return Response.json(
            { data: { attributes: { status: 'PROCESSING' }, id: 'ing-1' } },
            { status: 201 },
          );
        }
        // Every poll drops the connection — the generation was still paid
        // for and must not be lost to an unhandled rejection.
        throw new TypeError('fetch failed');
      }) as typeof fetch;
      const client = new ProductApiMediaGeneration({
        apiKey: 'test-key',
        apiUrl: 'https://api.genfeed.localhost/v1',
        fetchImpl,
      });
      const resultPromise = client.generate(
        request(),
        new AbortController().signal,
      );
      await vi.advanceTimersByTimeAsync(185_000);
      const result = await resultPromise;
      expect(result.status).toBe('failed');
      expect(result.error).toContain('still "PROCESSING"');
      // The balance is still reconciled after the poll gives up, so the
      // caller's ledger can record whatever the generation actually cost.
      expect(balanceCalls.length).toBe(2);
    });
  });
});

describe('readiness', () => {
  const probe = normalizeFfprobe(
    {
      format: { format_name: 'png_pipe', size: '120000' },
      streams: [
        { codec_name: 'png', codec_type: 'video', height: 1024, width: 1536 },
      ],
    },
    'image',
    '2026-09-26T00:00:00.000Z',
  );

  it('normalizes an ffprobe image probe', () => {
    expect(probe).toMatchObject({
      durationSeconds: null,
      height: 1024,
      kind: 'image',
      videoCodec: null,
      width: 1536,
    });
  });

  it('blocks an artifact whose aspect ratio is not the task spec', async () => {
    const task = await benchTask('brand-kit-fidelity'); // 1:1
    expect(checkTaskOutputSpec(task.task, probe)).toEqual([
      expect.stringContaining('does not match requested 1:1'),
    ]);
    expect(assessReadiness(task.task, probe, 'ing-1').status).toBe('blocked');
  });

  it('passes an on-spec artifact against a seeded platform spec', async () => {
    const task = await benchTask('prompt-adherence'); // 3:2
    const result = assessReadiness(task.task, probe, 'ing-1');
    expect(result.status).toBe('ready');
    expect(result.platform).not.toBeNull();
  });

  it('blocks a video that runs short of the requested duration', () => {
    const video = normalizeFfprobe(
      {
        format: { duration: '2.0', format_name: 'mov,mp4', size: '900000' },
        streams: [
          {
            avg_frame_rate: '24/1',
            codec_name: 'h264',
            codec_type: 'video',
            height: 1080,
            width: 1920,
          },
        ],
      },
      'video',
      '2026-09-26T00:00:00.000Z',
    );
    const task = mediaTaskSchema.parse({
      brandKey: null,
      source: 'bench',
      task: {
        id: 'clip',
        medium: 'video',
        outputSpec: { aspectRatio: '16:9', count: 1, durationSeconds: 5 },
        prompt: 'p',
        rationale: 'r',
        referenceRoles: ['none'],
        rubric: ['x'],
        title: 't',
        version: 1,
      },
      visibility: 'public',
    });
    expect(checkTaskOutputSpec(task.task, video)).toEqual([
      expect.stringContaining('short of requested 5s'),
    ]);
  });
});

describe('judge messages', () => {
  it('shows task, rubric and kit, labels answers only as A and B', async () => {
    const task = await benchTask('brand-kit-fidelity');
    const kit = await loadKelderBrandKit();
    const [system, user] = buildJudgeMessages({
      a: { frames: ['https://cdn.example/a.jpg'] },
      b: { frames: ['https://cdn.example/b.jpg'] },
      kit,
      task,
    });
    expect(system?.role).toBe('system');
    const parts = Array.isArray(user?.content) ? user.content : [];
    const text = parts
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join('\n');
    expect(text).toContain(task.task.prompt);
    expect(text).toContain('#C2410C');
    expect(text).not.toMatch(/flux|gpt|seedream|genfeed-compiled|compiled/i);
    expect(parts.filter((part) => part.type === 'image_url')).toHaveLength(2);
  });

  it('rejects a verdict that does not score every rubric line', () => {
    const side = {
      adherence: [
        { line: 0, yesProbability: 1 },
        { line: 1, yesProbability: 0.2 },
      ],
      brandFit: null,
      craft: 0.5,
    };
    expect(() =>
      assertVerdictCoversRubric(
        { a: side, b: side, choice: 'a', rationale: 'A counts right.' },
        3,
      ),
    ).toThrow(/expected 0..2/);
    expect(
      assertVerdictCoversRubric(
        { a: side, b: side, choice: 'tie', rationale: 'Even.' },
        2,
      ).choice,
    ).toBe('tie');
  });
});
