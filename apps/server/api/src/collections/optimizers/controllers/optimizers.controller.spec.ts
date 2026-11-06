vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn(
    (_req: unknown, _serializer: unknown, data: { docs: unknown[] }) =>
      data.docs,
  ),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { ModelsService } from '@api/collections/models/services/models.service';
import { OptimizersController } from '@api/collections/optimizers/controllers/optimizers.controller';
import type { AnalyzeContentDto } from '@api/collections/optimizers/dto/analyze.dto';
import type { GeneratePromptsDto } from '@api/collections/optimizers/dto/generate-prompts.dto';
import type { SuggestHashtagsDto } from '@api/collections/optimizers/dto/hashtags.dto';
import type { OptimizeContentDto } from '@api/collections/optimizers/dto/optimize.dto';
import type { GenerateVariantsDto } from '@api/collections/optimizers/dto/variants.dto';
import type { OptimizersService } from '@api/collections/optimizers/services/optimizers.service';
import { TEXT_MAX_OVERDRAFT_CREDITS } from '@api/helpers/utils/credits/finalize-deferred-credits.util';
import { testId } from '@helpers/testing/test-id.helper';
import type { Request } from 'express';

const organizationId = testId('org');
const user = {
  id: 'user_123',
  organizationId,
  userId: testId('user'),
} as unknown as User;

type Bill = (amount: number) => void;

/** One text-model run: what the optimizer was asked and what it billed. */
interface OptimizerRun {
  args: unknown[];
  method: string;
}

/**
 * The optimizer with a fixed per-call text-model cost, the organization's
 * credit balance and the default text model's minimum charge. Each run bills
 * the cost through the callback the controller hands it.
 */
function setup({ balance = 100, cost = 3, minimum = 2 } = {}) {
  const runs: OptimizerRun[] = [];
  const run =
    (method: string, result: unknown) =>
    async (...args: unknown[]) => {
      const bill = args.at(-1) as Bill;
      runs.push({ args: args.slice(0, -1), method });
      bill(cost);
      return result;
    };
  const optimizers = {
    analyzeContent: run('analyzeContent', { score: 75 }),
    generatePrompts: run('generatePrompts', { prompts: [{ id: 'p1' }] }),
    generateVariants: run('generateVariants', {
      variants: [{ content: 'Variant 1', score: 85 }],
    }),
    getBestPostingTimes: run('getBestPostingTimes', {
      times: [{ day: 'Monday', hour: 9 }],
    }),
    getOptimizationHistory: async (
      organization: string,
      userId: string,
      limit: number,
    ) => {
      runs.push({
        args: [organization, userId, limit],
        method: 'getOptimizationHistory',
      });
      return [{ id: 'opt-1' }];
    },
    optimizeContent: run('optimizeContent', { optimized: 'Better post' }),
    suggestHashtags: run('suggestHashtags', { hashtags: ['#AI'] }),
  };
  const credits = {
    checkOrganizationCreditsAvailable: async (_org: string, required: number) =>
      balance >= required,
    getOrganizationCreditsBalance: async () => balance,
  };
  const models = {
    findOne: async () => ({ cost: minimum, pricingType: 'flat' }),
  };
  const controller = new OptimizersController(
    optimizers as unknown as OptimizersService,
    credits as unknown as CreditsUtilsService,
    models as unknown as ModelsService,
  );
  return { controller, runs };
}

interface CreditsRequest {
  creditsConfig: {
    amount?: number;
    deferred: boolean;
    maxOverdraftCredits?: number;
  };
}

const deferredRequest = () =>
  ({ creditsConfig: { deferred: true } }) as unknown as Request &
    CreditsRequest;

const analyzeDto: AnalyzeContentDto = {
  content: 'Check out our new product!',
  contentType: 'caption',
};
const optimizeDto: OptimizeContentDto = {
  content: 'Original content',
  contentType: 'caption',
};
const hashtagsDto: SuggestHashtagsDto = {
  content: 'AI technology breakthrough',
  count: 10,
  platform: 'instagram',
};
const variantsDto: GenerateVariantsDto = {
  content: 'Original post',
  contentType: 'caption',
  count: 3,
  variationType: 'style',
};
const promptsDto: GeneratePromptsDto = {
  count: 3,
  input: 'A cat in space',
  mode: 'idea',
  targetMedia: 'image',
};

type Call = (
  controller: OptimizersController,
  request: Request,
) => Promise<unknown>;

const billedEndpoints: [string, Call, unknown[], unknown][] = [
  [
    'analyzeContent',
    (c, r) => c.analyzeContent(r, analyzeDto, user),
    [analyzeDto, organizationId, 'user_123'],
    { score: 75 },
  ],
  [
    'optimizeContent',
    (c, r) => c.optimizeContent(r, optimizeDto, user),
    [optimizeDto, organizationId, 'user_123'],
    { optimized: 'Better post' },
  ],
  [
    'suggestHashtags',
    (c, r) => c.suggestHashtags(r, hashtagsDto, user),
    [hashtagsDto, organizationId],
    { hashtags: ['#AI'] },
  ],
  [
    'generateVariants',
    (c, r) => c.generateVariants(r, variantsDto, user),
    [variantsDto, organizationId],
    { variants: [{ content: 'Variant 1', score: 85 }] },
  ],
  [
    'generatePrompts',
    (c, r) => c.generatePrompts(r, promptsDto, user),
    [promptsDto, organizationId],
    { prompts: [{ id: 'p1' }] },
  ],
  [
    'getBestPostingTimes',
    (c, r) => c.getBestPostingTimes(r, 'instagram', 'America/New_York', user),
    ['instagram', 'America/New_York', organizationId],
    { times: [{ day: 'Monday', hour: 9 }] },
  ],
];

describe('OptimizersController', () => {
  it.each(billedEndpoints)(
    '%s runs the optimizer for the organization and bills what it used',
    async (method, call, args, result) => {
      const { controller, runs } = setup({ cost: 3 });
      const request = deferredRequest();

      await expect(call(controller, request)).resolves.toEqual(result);

      expect(runs).toEqual([{ args, method }]);
      expect(request.creditsConfig).toEqual({
        amount: 3,
        deferred: false,
        maxOverdraftCredits: TEXT_MAX_OVERDRAFT_CREDITS,
      });
    },
  );

  it.each(billedEndpoints)(
    '%s refuses with 402 before running when the balance is below the text minimum',
    async (_method, call) => {
      const { controller, runs } = setup({ balance: 1, minimum: 2 });
      const request = deferredRequest();

      await expect(call(controller, request)).rejects.toMatchObject({
        status: 402,
      });
      expect(runs).toEqual([]);
      expect(request.creditsConfig).toEqual({ deferred: true });
    },
  );

  it('leaves a non-deferred charge untouched', async () => {
    const { controller } = setup({ cost: 3 });
    const request = {
      creditsConfig: { amount: 7, deferred: false },
    } as unknown as Request & CreditsRequest;

    await controller.analyzeContent(request, analyzeDto, user);

    expect(request.creditsConfig).toEqual({ amount: 7, deferred: false });
  });

  it('defaults the posting-times timezone to UTC', async () => {
    const { controller, runs } = setup();

    await controller.getBestPostingTimes(
      deferredRequest(),
      'twitter',
      undefined,
      user,
    );

    expect(runs).toEqual([
      {
        args: ['twitter', 'UTC', organizationId],
        method: 'getBestPostingTimes',
      },
    ]);
  });

  describe('getOptimizationHistory', () => {
    it('returns the requested number of entries for the current user', async () => {
      const { controller, runs } = setup();

      const history = await controller.getOptimizationHistory(
        {} as Request,
        '10',
        user,
      );

      expect(history).toEqual([{ id: 'opt-1' }]);
      expect(runs).toEqual([
        {
          args: [organizationId, 'user_123', 10],
          method: 'getOptimizationHistory',
        },
      ]);
    });

    it('defaults to the latest 20 entries', async () => {
      const { controller, runs } = setup();

      await controller.getOptimizationHistory({} as Request, undefined, user);

      expect(runs).toEqual([
        {
          args: [organizationId, 'user_123', 20],
          method: 'getOptimizationHistory',
        },
      ]);
    });
  });
});
