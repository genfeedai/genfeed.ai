import { randomUUID } from 'node:crypto';
import { AgentArtifactReferenceService } from '@api/agent-artifacts/agent-artifact-reference.service';
import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import type { OnboardingCreditGrantsService } from '@api/collections/credits/services/onboarding-credit-grants.service';
import { readPostGenerationReceipts } from '@api/collections/posts/services/post-generation-receipts.read';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { AgentCompletionCardBuilderService } from '@api/services/agent-orchestrator/agent-completion-card-builder.service';
import { AgentOrchestratorUiActionFinalizerService } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action-finalizer.service';
import type { DraftMediaLookup } from '@api/services/agent-orchestrator/tools/agent-publish-draft-media.util';
import { createAgentTextDraft } from '@api/services/agent-orchestrator/tools/agent-publish-post-actions';
import { AgentRouteRewriteService } from '@api/services/agent-orchestrator/tools/agent-route-rewrite.service';
import { buildMutationApprovalCard } from '@api/services/agent-orchestrator/tools/mutation-approval-card';
import { buildApprovedMutationOutcome } from '@api/services/agent-orchestrator/tools/mutation-approval-outcome';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { getActionDefinition } from '@genfeedai/actions';
import { PostVisibility } from '@genfeedai/contracts';
import type { ValidatedAgentScope } from '@genfeedai/contracts/interfaces';
import { PrismaClient } from '@genfeedai/prisma';
import {
  type ActionContractJsonSchema,
  compileActionContract,
} from '@genfeedai/workflows/engine';
import type { LoggerService } from '@libs/logger/logger.service';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

// Explicit opt-in to an isolated, migrated database; never DATABASE_URL.
const connectionString = process.env.AGENT_MASTER_THREAD_TEST_DATABASE_URL;

describe.skipIf(!connectionString)(
  'saved agent draft receipt PostgreSQL',
  () => {
    const prisma = connectionString
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
      : null;
    function database() {
      if (!prisma)
        throw new Error('AGENT_MASTER_THREAD_TEST_DATABASE_URL is required');
      return prisma;
    }
    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as unknown as LoggerService;
    afterAll(async () => {
      await prisma?.$disconnect();
    });

    it('attaches Library media and preserves the generated draft and copy receipt on retry', async () => {
      const db = database();
      const requestKey = randomUUID();
      const user = await db.user.create({
        data: { handle: `attachment-${requestKey}` },
      });
      const organization = await db.organization.create({
        data: {
          label: 'Attachment fixture',
          slug: `attachment-${requestKey}`,
          userId: user.id,
        },
      });
      const brand = await db.brand.create({
        data: {
          label: 'Attachment brand',
          slug: `attachment-${requestKey}`,
          organizationId: organization.id,
        },
      });
      const scope = {
        brandId: brand.id,
        organizationId: organization.id,
        userId: user.id,
      };
      const posts = new PostsService(
        db as unknown as PrismaService,
        logger,
        {} as OnboardingCreditGrantsService,
      );
      const draft = await posts.create({
        ...scope,
        description: 'The original generated copy.',
        ingredients: [],
        label: 'Generated draft',
        sourceActionId: requestKey,
      });
      const receiptFields = {
        actorId: user.id,
        brandId: brand.id,
        candidateIndex: 0,
        id: randomUUID(),
        isDeleted: false,
        mode: 'provisional_brand',
        organizationId: organization.id,
        requestHash: `sha256:${'0'.repeat(64)}`,
        requestKey,
        revision: 0,
        state: 'needs_review',
        surface: 'agent',
      };
      const timestamp = new Date();
      const projection = {
        ...receiptFields,
        artifact: { id: draft.id, kind: 'post' },
        createdAt: timestamp.toISOString(),
        updatedAt: timestamp.toISOString(),
      };
      const receipt = await db.$transaction(async (tx) => {
        const savedReceipt = await tx.brandedGenerationReceipt.create({
          data: {
            ...receiptFields,
            createdAt: timestamp,
            updatedAt: timestamp,
            projection,
          },
        });
        await tx.brandedGenerationReceiptEvent.create({
          data: {
            actorId: user.id,
            brandId: brand.id,
            operationHash: receiptFields.requestHash,
            operationKey: 'create',
            organizationId: organization.id,
            projection,
            receiptId: savedReceipt.id,
            revision: 0,
            type: 'create',
          },
        });
        return savedReceipt;
      });
      const image = await db.ingredient.create({
        data: { ...scope, category: 'IMAGE', status: 'UPLOADED' },
      });
      const args = {
        brandId: brand.id,
        content: 'Keep the draft copy instead.',
        mediaUrls: [`https://cdn.test/ingredients/images/${image.id}`],
        postId: draft.id,
      };
      const ingredients: DraftMediaLookup = {
        findOne: (where) => db.ingredient.findFirst({ where }),
      };

      await expect(
        createAgentTextDraft(
          posts,
          args,
          scope,
          PostVisibility.PUBLIC,
          ingredients,
        ),
      ).resolves.toMatchObject({ data: { id: draft.id }, success: true });
      await expect(
        createAgentTextDraft(
          posts,
          args,
          scope,
          PostVisibility.PUBLIC,
          ingredients,
        ),
      ).resolves.toMatchObject({ data: { id: draft.id }, success: true });
      const saved = await db.post.findMany({
        where: { organizationId: organization.id, isDeleted: false },
        include: { ingredientLinks: true },
      });
      expect(saved).toMatchObject([
        {
          id: draft.id,
          description: 'The original generated copy.',
          label: 'Generated draft',
          targetExecutionState: 'draft',
          ingredientLinks: [{ ingredientId: image.id, position: 0 }],
        },
      ]);
      expect(
        await readPostGenerationReceipts(db, organization.id, saved),
      ).toEqual(
        new Map([
          [draft.id, { receiptId: receipt.id, receiptState: 'needs_review' }],
        ]),
      );
      expect(
        await db.brandedGenerationReceipt.findUnique({
          where: { id: receipt.id },
        }),
      ).toEqual(receipt);
    });

    it.each([
      {
        args: {
          content: 'Review a draft before publishing to catch mistakes.',
          title: 'QA 0.3.2 — draft review',
        },
        expectedItems: [{ label: 'Title', value: 'QA 0.3.2 — draft review' }],
        expectedTitle: 'QA 0.3.2 — draft review',
      },
      {
        args: {
          content: 'Review a draft before publishing to catch mistakes.',
        },
        expectedItems: [],
        expectedTitle: 'Review a draft before publishing to catch mistakes.',
      },
    ])(
      'reopens the saved $expectedTitle from its persisted chat receipt',
      async ({ args, expectedItems, expectedTitle }) => {
        const suffix = randomUUID();
        const db = database();
        const user = await db.user.create({
          data: { handle: `draft-${suffix}` },
        });
        const organization = await db.organization.create({
          data: {
            label: 'Draft fixture',
            slug: `draft-${suffix}`,
            userId: user.id,
          },
        });
        const brand = await db.brand.create({
          data: {
            label: 'Draft brand',
            slug: `brand-${suffix}`,
            organizationId: organization.id,
          },
        });
        const thread = await db.agentThread.create({
          data: {
            brandId: brand.id,
            contextVersion: 2,
            organizationId: organization.id,
            userId: user.id,
          },
        });
        const scope: ValidatedAgentScope = {
          brandId: brand.id,
          contextVersion: 2,
          isLegacyFallback: false,
          isVersionExplicit: true,
          organizationId: organization.id,
          source: 'explicit',
          threadId: thread.id,
          userId: user.id,
        };
        const ctx = {
          brandId: brand.id,
          organizationId: organization.id,
          threadId: thread.id,
          userId: user.id,
          validatedScope: scope,
        };
        const definition = getActionDefinition('create_post');
        if (!definition) throw new Error('create_post contract is missing');
        compileActionContract('create_post', {
          inputSchema: definition.inputSchema as ActionContractJsonSchema,
          outputSchema: definition.outputSchema as ActionContractJsonSchema,
        }).validateInput(args, {
          nodeId: 'create',
          runId: 'run',
          workflowId: 'workflow',
          workflowVersionId: 'v1',
        });
        const proposal = buildMutationApprovalCard(
          'approval',
          'create_post',
          args,
          ctx,
        );
        expect(proposal.data).toMatchObject({
          items: expect.arrayContaining(expectedItems),
        });

        const posts = new PostsService(
          db as unknown as PrismaService,
          logger,
          {} as OnboardingCreditGrantsService,
        );
        const raw = await createAgentTextDraft(
          posts,
          args,
          ctx,
          PostVisibility.PUBLIC,
        );
        const routes = new AgentRouteRewriteService(
          logger,
          {
            findOne: async () =>
              db.brand.findFirst({
                where: {
                  id: brand.id,
                  organizationId: organization.id,
                  isDeleted: false,
                },
              }),
          },
          { findOne: async () => null },
          { findOne: async () => organization } as never,
        );
        const result = await routes.scopeToolResultHrefs(raw, ctx);
        const postId = result.data?.id;
        if (typeof postId !== 'string')
          throw new Error('No persisted draft identity');
        const href = `/${organization.slug}/${brand.slug}/publishing/posts/${postId}`;
        expect(result.data).toMatchObject({
          title: expectedTitle,
          href,
          brandId: brand.id,
          agentContextSource: 'explicit',
          agentContextVersion: 2,
        });
        const reopened = await posts.findOne({
          id: postId,
          brandId: brand.id,
          organizationId: organization.id,
          isDeleted: false,
        });
        expect(reopened).toMatchObject({
          id: postId,
          label: expectedTitle,
          description: args.content,
          targetExecutionState: 'draft',
          scheduledDate: null,
          agentContextVersion: 2,
        });
        expect(
          await db.post.count({
            where: { organizationId: organization.id, isDeleted: false },
          }),
        ).toBe(1);

        const outcome = buildApprovedMutationOutcome(
          'create_post',
          args,
          result,
        );
        if (!outcome) throw new Error('No saved draft receipt');
        const messages = new AgentMessagesService(
          db as unknown as PrismaService,
          logger,
          new AgentArtifactReferenceService(db),
        );
        const finalizer = new AgentOrchestratorUiActionFinalizerService(
          messages,
          { getOrganizationCreditsBalance: async () => 100 } as never,
          new AgentCompletionCardBuilderService(),
          {
            recordAssistantFinalized: async () => undefined,
            recordRunCompleted: async () => undefined,
          } as never,
        );
        const response = await finalizer.finalizeStructuredAssistantTurn({
          content: outcome.content,
          context: { organizationId: organization.id, userId: user.id, scope },
          model: 'test',
          result,
          threadId: thread.id,
          toolCalls: [
            {
              durationMs: 0,
              status: 'completed',
              toolName: 'create_post',
              creditsUsed: 0,
            },
          ],
        });
        expect(response.message.content).toContain(
          `[${expectedTitle}](${href})`,
        );
        const restored = await messages.getMessagesByRoom(
          thread.id,
          organization.id,
        );
        expect(restored).toHaveLength(1);
        expect(restored[0]).toMatchObject({
          content: response.message.content,
          artifactReferences: [],
          metadata: {
            uiActions: expect.arrayContaining([
              expect.objectContaining({
                ctas: [{ href, label: 'Open draft' }],
              }),
            ]),
          },
        });
      },
    );
  },
);
