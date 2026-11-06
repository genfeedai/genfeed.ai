import { BUILT_IN_SKILL_CATALOG } from '@api/collections/skills/constants/skill-validation.constant';
import type { SkillLibraryService } from '@api/collections/skills/services/skill-library.service';
import type { SkillsService } from '@api/collections/skills/services/skills.service';
import { SYSTEM_WORKFLOW_PRINCIPAL_ID } from '@api/collections/workflows/system-workflow.contract';
import type {
  SystemWorkflowActionRequest,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import type { ContentGeoOptimizerHandler } from '@api/services/skill-executor/handlers/content-geo-optimizer.handler';
import type { ContentWritingHandler } from '@api/services/skill-executor/handlers/content-writing.handler';
import type { ImageGenerationHandler } from '@api/services/skill-executor/handlers/image-generation.handler';
import type { TrendDiscoveryHandler } from '@api/services/skill-executor/handlers/trend-discovery.handler';
import type { TrendRemixHandler } from '@api/services/skill-executor/handlers/trend-remix.handler';
import type { SkillExecutionContext } from '@api/services/skill-executor/interfaces/skill-executor.interfaces';
import { SkillWorkflowService } from '@api/services/skill-executor/skill-executor.service';
import { SKILL_ACTION_IDS } from '@api/services/skill-executor/skill-workflow-definition';
import { beforeEach, describe, expect, it } from 'vitest';

type Action = (request: SystemWorkflowActionRequest) => Promise<unknown>;

interface Pin {
  contentHash: string;
  skillId: string;
  skillVersionId: string;
}

interface Run {
  actionType: string;
  canonicalId: string;
  inputValues: { context: Record<string, unknown>; params: unknown };
  organizationId: string;
  userId?: string;
}

const ORG = 'org-1';
const BRAND = 'brand-1';
const context: SkillExecutionContext = {
  brandId: BRAND,
  brandVoice: 'Direct',
  organizationId: ORG,
  platforms: ['instagram'],
};

const builtIn = (slug: string) => {
  const skill = BUILT_IN_SKILL_CATALOG.find((entry) => entry.slug === slug);
  if (!skill) throw new Error(`Missing ${slug} fixture`);
  return skill;
};

describe('SkillWorkflowService', () => {
  let actions: Map<string, Action>;
  let workflows: Set<string>;
  let runs: Run[];
  let skillState: { isEnabled: boolean; status: string };
  let brandDisabledSkills: string[];
  let revokedUsers: string[];
  let published: { contentHash: string; skillVersionId: string };
  let resolutions: { userId: string; versionIds: string[] }[];
  let service: SkillWorkflowService;

  /** Runs the registered action again with a run's stored input. */
  const replay = (run: Run, userId = run.userId ?? '') => {
    const action = actions.get(run.actionType);
    if (!action) throw new Error(`No action ${run.actionType}`);
    return action({
      context: { organizationId: run.organizationId, userId },
      input: run.inputValues,
    } as unknown as SystemWorkflowActionRequest);
  };

  beforeEach(() => {
    actions = new Map();
    workflows = new Set();
    runs = [];
    skillState = { isEnabled: true, status: 'published' };
    brandDisabledSkills = [];
    revokedUsers = [];
    published = { contentHash: 'hash-v1', skillVersionId: 'sv-1' };
    resolutions = [];

    // The system workflow engine: registered actions run registered workflows.
    const runner = {
      registerAction: (id: string, action: Action) => actions.set(id, action),
      registerWorkflow: ({ canonicalId }: { canonicalId: string }) =>
        workflows.add(canonicalId),
      runWorkflow: async (run: Run) => {
        if (!workflows.has(run.canonicalId)) {
          throw new Error(`Unknown system workflow: ${run.canonicalId}`);
        }
        runs.push(run);
        return {
          provenance: { executionId: `execution-${runs.length}` },
          result: await replay(run),
        };
      },
    };
    const skills = {
      assertBrandSkillEnabled: async (
        _organizationId: string,
        _brandId: string,
        slug: string,
      ) => {
        if (brandDisabledSkills.includes(slug)) {
          throw new Error(`Skill ${slug} is disabled for this brand`);
        }
      },
      getSkillById: async (_organizationId: string, slug: string) => ({
        ...builtIn(slug),
        ...skillState,
      }),
    };
    // The skill library resolves a pinned version, else the published one.
    const skillLibrary = {
      authorizeResolved: async (
        actor: { userId: string },
        docs: { id: string }[],
        pins: Pin[],
      ) => ({
        excluded: [],
        included: revokedUsers.includes(actor.userId)
          ? []
          : docs.map((doc) => ({
              ...doc,
              systemPromptTemplate: `instructions ${pins[0]?.skillVersionId ?? published.skillVersionId}`,
            })),
        versions: [{ ...(pins[0] ?? published), skillId: String(docs[0]?.id) }],
      }),
      recordResolution: async (actor: { userId: string }, versions: Pin[]) => {
        resolutions.push({
          userId: actor.userId,
          versionIds: versions.map((version) => version.skillVersionId),
        });
      },
    };
    const handler = {
      execute: async (
        executed: SkillExecutionContext & { userId?: string },
        params: Record<string, unknown>,
      ) => ({
        content: `Post about ${String(params.topic)} for ${executed.brandId} by ${executed.userId}`,
        metadata: {},
        platforms: executed.platforms,
        type: 'text',
      }),
    };

    service = new SkillWorkflowService(
      skills as unknown as SkillsService,
      runner as unknown as SystemWorkflowRunnerService,
      handler as unknown as ContentGeoOptimizerHandler,
      handler as unknown as ContentWritingHandler,
      handler as unknown as ImageGenerationHandler,
      handler as unknown as TrendDiscoveryHandler,
      handler as unknown as TrendRemixHandler,
      skillLibrary as unknown as SkillLibraryService,
    );
    service.onModuleInit();
  });

  it('registers every exact skill action and its workflow', () => {
    expect([...actions.keys()]).toEqual(Object.values(SKILL_ACTION_IDS));
    expect([...workflows]).toEqual(
      Object.keys(SKILL_ACTION_IDS).map((slug) => `skill.${slug}`),
    );
  });

  it('runs the canonical workflow and returns its draft and provenance', async () => {
    const result = await service.execute(
      'content-writing',
      context,
      { topic: 'launch' },
      'user-1',
    );

    expect(result).toMatchObject({
      creditsUsed: 0,
      draft: {
        content: 'Post about launch for brand-1 by user-1',
        platforms: ['instagram'],
      },
      executionId: 'execution-1',
    });
    expect(runs).toMatchObject([
      {
        canonicalId: 'skill.content-writing',
        organizationId: ORG,
        userId: 'user-1',
      },
    ]);
    expect(resolutions).toEqual([{ userId: 'user-1', versionIds: ['sv-1'] }]);
  });

  it('pins the authorized version on the workflow input before execution', async () => {
    await service.execute('content-writing', context, {}, 'user-1');

    expect(runs[0]?.inputValues.context.pinnedSkills).toEqual([
      {
        contentHash: 'hash-v1',
        instructions: 'instructions sv-1',
        slug: 'content-writing',
        versionId: 'sv-1',
      },
    ]);
  });

  it('replays a run on its pinned version after a newer one is published', async () => {
    await service.execute('content-writing', context, {}, 'user-1');
    published = { contentHash: 'hash-v2', skillVersionId: 'sv-2' };

    await replay(runs[0] as Run);

    expect(resolutions).toEqual([
      { userId: 'user-1', versionIds: ['sv-1'] },
      { userId: 'user-1', versionIds: ['sv-1'] },
    ]);
  });

  it('pins the version on a run that reached the action without one', async () => {
    const run: Run = {
      actionType: SKILL_ACTION_IDS['content-writing'],
      canonicalId: 'skill.content-writing',
      inputValues: { context: { ...context }, params: { topic: 'launch' } },
      organizationId: ORG,
      userId: 'user-1',
    };

    await replay(run);

    expect(run.inputValues.context.pinnedSkills).toEqual([
      expect.objectContaining({ slug: 'content-writing', versionId: 'sv-1' }),
    ]);
  });

  it('records no resolution for the public tools principal', async () => {
    await service.execute(
      'content-writing',
      context,
      {},
      SYSTEM_WORKFLOW_PRINCIPAL_ID,
    );

    expect(resolutions).toEqual([]);
  });

  it('rejects a slug outside the reviewed action catalog', async () => {
    await expect(
      service.execute('custom-skill', context),
    ).rejects.toMatchObject({ status: 404 });
    expect(runs).toEqual([]);
  });

  it.each([
    ['a disabled skill', () => Object.assign(skillState, { isEnabled: false })],
    [
      'a withdrawn skill',
      () => Object.assign(skillState, { status: 'disabled' }),
    ],
    ['a skill the user may no longer use', () => revokedUsers.push('user-1')],
  ])('does not run %s', async (_case, arrange) => {
    arrange();

    await expect(
      service.execute('content-writing', context, {}, 'user-1'),
    ).rejects.toMatchObject({ status: 404 });
    expect(resolutions).toEqual([]);
  });

  it('does not run a skill the brand switched off', async () => {
    brandDisabledSkills = ['content-writing'];

    await expect(
      service.execute('content-writing', context, {}, 'user-1'),
    ).rejects.toThrow('Skill content-writing is disabled for this brand');
  });

  it('refuses a run whose input names another organization', async () => {
    await expect(
      replay({
        actionType: SKILL_ACTION_IDS['content-writing'],
        canonicalId: 'skill.content-writing',
        inputValues: {
          context: { ...context, organizationId: 'org-2' },
          params: {},
        },
        organizationId: ORG,
        userId: 'user-1',
      }),
    ).rejects.toThrow('Skill workflow organization context mismatch');
  });
});
