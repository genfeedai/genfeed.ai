vi.mock('@api/collections/credits/services/credits.utils.service', () => ({
  CreditsUtilsService: class CreditsUtilsService {},
}));
vi.mock('@api/services/integrations/fal/services/fal.service', () => ({
  FalService: class FalService {},
}));
vi.mock(
  '@api/services/integrations/managed-inference-runtime/managed-inference-runtime.service',
  () => ({
    ManagedInferenceRuntimeService: class ManagedInferenceRuntimeService {},
  }),
);
vi.mock(
  '@api/services/integrations/leonardoai/services/leonardoai.service',
  () => ({
    LeonardoAIService: class LeonardoAIService {},
  }),
);
vi.mock(
  '@api/services/integrations/replicate/services/replicate.service',
  () => ({
    ReplicateService: class ReplicateService {},
  }),
);
vi.mock('@libs/logger/logger.service', () => ({
  LoggerService: class LoggerService {},
}));

import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import {
  ManagedInferenceOperation,
  ManagedInferenceProvider,
  type ManagedInferenceRequestDto,
} from '@api/endpoints/v1/managed-inference/dto/managed-inference-request.dto';
import type { ManagedInferenceAuthenticatedRequest } from '@api/endpoints/v1/managed-inference/interfaces/managed-inference.interfaces';
import { ManagedInferenceService } from '@api/endpoints/v1/managed-inference/managed-inference.service';
import type { FalService } from '@api/services/integrations/fal/services/fal.service';
import type { LeonardoAIService } from '@api/services/integrations/leonardoai/services/leonardoai.service';
import type { ManagedInferenceRuntimeService } from '@api/services/integrations/managed-inference-runtime/managed-inference-runtime.service';
import type { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { PollUntilService } from '@api/shared/services/poll-until/poll-until.service';
import { ActivitySource } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';

const request = {
  user: {
    brandId: 'brand-1',
    id: 'user-1',
    organizationId: 'org-1',
    userId: 'user-1',
  },
} as ManagedInferenceAuthenticatedRequest;

interface LedgerEntry {
  amount: number;
  brandId?: string;
  description: string;
  kind: 'debit' | 'refund';
  source?: string;
}

/**
 * The organization's credit balance and ledger, the hosted providers and the
 * dedicated Genfeed video runtime. Provider runs are recorded in the order
 * they reach a provider.
 */
function setup({
  balance = 10,
  dedicatedOrgs = ['org-1'],
  providerError = null as Error | null,
} = {}) {
  const state = { balance };
  const ledger: LedgerEntry[] = [];
  const providerRuns: { input: unknown; model: string; provider: string }[] =
    [];
  const runtimeJobs = new Map<string, unknown>();
  const run =
    (provider: string, output: (model: string) => unknown) =>
    async (model: string, input: unknown) => {
      providerRuns.push({ input, model, provider });
      if (providerError) throw providerError;
      return output(model);
    };
  const credits = {
    checkOrganizationCreditsAvailable: async (_org: string, required: number) =>
      state.balance >= required,
    deductCreditsFromOrganization: async (
      _org: string,
      _user: string,
      amount: number,
      description: string,
      source: string,
      { brandId }: { brandId?: string },
    ) => {
      state.balance -= amount;
      ledger.push({ amount, brandId, description, kind: 'debit', source });
    },
    refundOrganizationCredits: async (
      _org: string,
      amount: number,
      _source: string,
      description: string,
      _expiresAt: Date,
      { brandId }: { brandId?: string },
    ) => {
      state.balance += amount;
      ledger.push({ amount, brandId, description, kind: 'refund' });
    },
  };
  const fal = {
    generateImage: run('fal:image', (model) => ({
      url: `https://img.test/${model}.jpg`,
    })),
    generateVideo: run('fal:video', (model) => ({
      url: `https://video.test/${model}.mp4`,
    })),
  };
  const runtime = {
    generateManagedVideoForOrg: async (input: Record<string, unknown>) => {
      providerRuns.push({ input, model: 'runtime', provider: 'genfeedai' });
      const jobId = `job-${runtimeJobs.size + 1}`;
      runtimeJobs.set(jobId, {
        output: { video_url: 'https://video.test/genfeed.mp4' },
        status: 'completed',
      });
      return { jobId };
    },
    hasDedicatedInstanceForOrg: async (organizationId: string) =>
      dedicatedOrgs.includes(organizationId),
    pollManagedJobForOrg: async (_org: string, _kind: string, jobId: string) =>
      runtimeJobs.get(jobId) ?? null,
  };
  const silent = () => undefined;
  const logger = {
    error: silent,
    log: silent,
    warn: silent,
  } as unknown as LoggerService;
  const service = new ManagedInferenceService(
    credits as unknown as CreditsUtilsService,
    fal as unknown as FalService,
    runtime as unknown as ManagedInferenceRuntimeService,
    {} as LeonardoAIService,
    {} as ReplicateService,
    logger,
    new PollUntilService(logger),
  );
  return { ledger, providerRuns, service, state };
}

const falImage: ManagedInferenceRequestDto = {
  input: { prompt: 'test' },
  model: 'fal-ai/flux/dev',
  operation: ManagedInferenceOperation.IMAGE,
  provider: ManagedInferenceProvider.FAL,
};

const genfeedVideo: ManagedInferenceRequestDto = {
  input: {
    imageUrl: 'https://img.test/source.jpg',
    prompt: 'cinematic pan',
  },
  model: 'genfeedai/wan-i2v-lora',
  operation: ManagedInferenceOperation.VIDEO,
  provider: ManagedInferenceProvider.GENFEEDAI,
};

describe('ManagedInferenceService', () => {
  it('debits credits and runs fal image inference', async () => {
    const { ledger, service, state } = setup();

    await expect(service.execute(falImage, request)).resolves.toEqual({
      creditsDebited: 1,
      model: 'fal-ai/flux/dev',
      operation: ManagedInferenceOperation.IMAGE,
      output: { url: 'https://img.test/fal-ai/flux/dev.jpg' },
      provider: ManagedInferenceProvider.FAL,
    });
    expect(state.balance).toBe(9);
    expect(ledger).toEqual([
      {
        amount: 1,
        brandId: 'brand-1',
        description: 'Managed inference image fal:fal-ai/flux/dev',
        kind: 'debit',
        source: ActivitySource.IMAGE_GENERATION,
      },
    ]);
  });

  it('debits credits and runs fal video inference', async () => {
    const { ledger, service } = setup();
    const model = 'fal-ai/kling-video/v1/standard/text-to-video';

    await expect(
      service.execute(
        {
          input: { prompt: 'video prompt' },
          model,
          operation: ManagedInferenceOperation.VIDEO,
          provider: ManagedInferenceProvider.FAL,
        },
        request,
      ),
    ).resolves.toEqual({
      creditsDebited: 1,
      model,
      operation: ManagedInferenceOperation.VIDEO,
      output: { url: `https://video.test/${model}.mp4` },
      provider: ManagedInferenceProvider.FAL,
    });
    expect(ledger).toEqual([
      {
        amount: 1,
        brandId: 'brand-1',
        description: `Managed inference video fal:${model}`,
        kind: 'debit',
        source: ActivitySource.VIDEO_GENERATION,
      },
    ]);
  });

  it('runs genfeedai video on the organization dedicated runtime and waits for the render', async () => {
    const { providerRuns, service } = setup();

    const result = await service.execute(genfeedVideo, request);

    expect(result.output).toEqual({
      jobId: 'job-1',
      url: 'https://video.test/genfeed.mp4',
    });
    expect(providerRuns).toEqual([
      {
        input: expect.objectContaining({
          imageUrl: 'https://img.test/source.jpg',
          organizationId: 'org-1',
          prompt: 'cinematic pan',
        }),
        model: 'runtime',
        provider: 'genfeedai',
      },
    ]);
  });

  it('rejects genfeedai video before debit when the organization has no dedicated runtime', async () => {
    const { ledger, providerRuns, service, state } = setup({
      dedicatedOrgs: [],
    });

    await expect(service.execute(genfeedVideo, request)).rejects.toHaveProperty(
      'status',
      403,
    );
    expect(state.balance).toBe(10);
    expect(ledger).toEqual([]);
    expect(providerRuns).toEqual([]);
  });

  it('returns 402 before debit when managed credits are insufficient', async () => {
    const { ledger, providerRuns, service } = setup({ balance: 1 });

    await expect(
      service.execute({ ...falImage, credits: 2 }, request),
    ).rejects.toHaveProperty('status', 402);
    expect(ledger).toEqual([]);
    expect(providerRuns).toEqual([]);
  });

  it('refunds credits when provider execution fails after debit', async () => {
    const { ledger, service, state } = setup({
      providerError: new Error('provider failed'),
    });

    await expect(service.execute(falImage, request)).rejects.toThrow(
      'provider failed',
    );
    expect(state.balance).toBe(10);
    expect(ledger).toEqual([
      expect.objectContaining({
        amount: 1,
        description: 'Managed inference image fal:fal-ai/flux/dev',
        kind: 'debit',
      }),
      {
        amount: 1,
        brandId: 'brand-1',
        description: 'Managed inference refund fal:fal-ai/flux/dev',
        kind: 'refund',
      },
    ]);
  });

  it('refuses crun models before any credit check', async () => {
    const { ledger, service } = setup();

    await expect(
      service.execute({ ...falImage, model: 'crun/model' }, request),
    ).rejects.toHaveProperty('status', 400);
    expect(ledger).toEqual([]);
  });
});
