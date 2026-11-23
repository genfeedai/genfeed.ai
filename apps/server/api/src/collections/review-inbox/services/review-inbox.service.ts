import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { AgentThreadAccessService } from '@api/collections/agent-threads/services/agent-thread-access.service';
import { resolveBrandLogoCdnUrls } from '@api/collections/brands/utils/brand-logo-urls.util';
import { approvalGenerationQuote } from '@api/collections/mcp-approvals/schemas/mcp-approval-pricing.schema';
import {
  expireLateSchedulingApprovals,
  expireStaleMcpApprovals,
} from '@api/collections/mcp-approvals/utils/mcp-approval-expiry.util';
import {
  describeMcpApprovalAction,
  MCP_APPROVAL_CAPTION_ARGUMENT_KEYS,
} from '@api/collections/mcp-approvals/utils/mcp-approval-summary.util';
import type {
  ReviewInboxListInput,
  ReviewInboxMemberInput,
  ReviewInboxViewerAccess,
} from '@api/collections/review-inbox/review-inbox.types';
import {
  RolesGuard,
  type RolesGuardRequest,
} from '@api/helpers/guards/roles/roles.guard';
import type { ITenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.types';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { estimateToolCreditCost, getToolByName } from '@genfeedai/actions';
import {
  AgentThreadAccessLevel,
  AgentThreadOwnerFilter,
  AgentThreadStatus,
  MemberRole,
} from '@genfeedai/contracts';
import {
  buildReviewInboxItemId,
  type IReviewInboxItem,
  type IReviewInboxItemPreview,
  type IReviewInboxQuestion,
  type IReviewInboxQuestionOption,
  readScheduledReleaseBatch,
} from '@genfeedai/contracts/interfaces';
import {
  McpApprovalStatus,
  Prisma,
  WorkflowExecutionStatus,
} from '@genfeedai/prisma';
import {
  isRecord,
  readNonBlankStringOrNull as readString,
} from '@genfeedai/utils/data/extract.util';
import { ConfigService } from '@libs/config/config.service';
import { Traced } from '@libs/tracing/traced';
import { HttpException, Injectable } from '@nestjs/common';

const HTTP_PROTOCOL_PREFIX_PATTERN = /^https?:\/\//i;

/** Each source is capped so one noisy producer cannot flood the inbox. */
const REVIEW_INBOX_SOURCE_LIMIT = 200;
/**
 * Threads waiting on an answer. Lower than the other sources because each one
 * also reads its pending questions out of the snapshot.
 */
const REVIEW_INBOX_QUESTION_THREAD_LIMIT = 50;
const PREVIEW_MAX_LENGTH = 280;
/** Who may decide a workflow review gate, as the workflow approve route allows. */
const REVIEW_GATE_ROLES: MemberRole[] = [
  MemberRole.OWNER,
  MemberRole.ADMIN,
  MemberRole.CREATOR,
];
const DEFAULT_REVIEW_GATE_TIMEOUT_HOURS = 24;
const MEDIA_ARGUMENT_KEYS = ['mediaUrl', 'imageUrl', 'videoUrl'] as const;

function releaseCredentialIds(release: unknown): string[] {
  const targets =
    isRecord(release) && Array.isArray(release.targets) ? release.targets : [];
  return targets.flatMap((target) =>
    isRecord(target) ? (readString(target.credentialId) ?? []) : [],
  );
}

/** Every brand a week's releases and their channel accounts belong to. */
function batchBrandIds(
  batch: readonly unknown[] | null,
  accountBrandIds: ReadonlyMap<string, string | null>,
): string[] {
  return (batch ?? []).flatMap((release) => {
    const releaseBrandId = isRecord(release)
      ? readString(release.brandId)
      : null;
    const accounts = releaseCredentialIds(release).flatMap((credentialId) => {
      const accountBrandId = accountBrandIds.get(credentialId);
      // An account with no brand is outside every brand-limited member's reach.
      return accountBrandId === undefined ? [] : [accountBrandId ?? ''];
    });
    return releaseBrandId ? [releaseBrandId, ...accounts] : accounts;
  });
}

function readValidTimestamp(value: unknown): string | null {
  const text = readString(value);
  if (!text) return null;
  const time = Date.parse(text);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function readQuestionOptions(value: unknown): IReviewInboxQuestionOption[] {
  return (Array.isArray(value) ? value : []).flatMap((option) => {
    if (!isRecord(option)) return [];
    const id = readString(option.id);
    const label = readString(option.label);
    return id && label
      ? [{ description: readString(option.description), id, label }]
      : [];
  });
}

/** A pending request of a thread snapshot as the inbox shows it, or null. */
function readAgentQuestion(
  threadId: string,
  request: unknown,
): IReviewInboxQuestion | null {
  if (!isRecord(request)) return null;
  const requestId = readString(request.requestId);
  const prompt = readString(request.prompt);
  if (!requestId || !prompt) return null;
  return {
    allowFreeText: request.allowFreeText === true,
    isMultiSelect: request.isMultiSelect === true,
    maxSelections:
      typeof request.maxSelections === 'number' ? request.maxSelections : null,
    options: readQuestionOptions(request.options),
    prompt,
    requestId,
    threadId,
  };
}

function excerpt(value: string | null): string | null {
  if (!value) return null;
  const text = value.trim();
  return text.length <= PREVIEW_MAX_LENGTH
    ? text
    : `${text.slice(0, PREVIEW_MAX_LENGTH - 1).trimEnd()}…`;
}

function readHttpUrl(value: unknown): string | null {
  const url = readString(value);
  return url && HTTP_PROTOCOL_PREFIX_PATTERN.test(url) ? url : null;
}

/**
 * Read side of the publishing review inbox (#7340): the workflow review gates,
 * MCP approvals and agent questions waiting on a human, projected into one row
 * model. Turbo run drafts stay on the Turbo run endpoints.
 */
@Traced()
@Injectable()
export class ReviewInboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandAccess: BrandAccessService,
    private readonly rolesGuard: RolesGuard,
    private readonly configService: ConfigService,
    private readonly threadAccess: AgentThreadAccessService,
  ) {}

  /** The viewer's roles and brand reach, resolved the way the guards do. */
  async resolveViewerAccess(
    request: RolesGuardRequest & { user: AuthenticatedUser },
    scope: ITenantReadScope,
  ): Promise<ReviewInboxViewerAccess> {
    const user = request.user;
    const [canResolveWorkflowGates, canResolveMcpApprovals, brandScope] =
      await Promise.all([
        this.hasRoles(request, REVIEW_GATE_ROLES),
        this.hasRoles(request, [MemberRole.OWNER, MemberRole.ADMIN]),
        // A superadmin override reads another organization the caller is
        // not a member of: it sees every brand there, and its own
        // membership is never looked up inside that tenant.
        scope.isOrganizationOverride
          ? Promise.resolve({ brandIds: undefined })
          : this.brandAccess.resolve({
              apiKeyId: user.apiKeyId,
              isApiKey: user.isApiKey,
              organizationId: scope.organizationId,
              scopes: user.scopes,
              userId: user.userId ?? user.id,
            }),
      ]);
    return {
      actor: scope.isOrganizationOverride
        ? undefined
        : {
            apiKeyId: user.apiKeyId,
            isApiKey: user.isApiKey,
            organizationId: scope.organizationId,
            scopes: user.scopes,
            userId: user.userId ?? user.id,
          },
      brandIds: brandScope.brandIds,
      canResolveMcpApprovals,
      canResolveWorkflowGates,
    };
  }

  /**
   * The workflow review gates a member could decide, for in-process callers
   * (agent chat) that have no HTTP request to run the role guard on. MCP
   * approvals stay out: agent chat already shows its own approval cards.
   */
  async listPendingReviewGatesForMember(
    input: ReviewInboxMemberInput,
  ): Promise<IReviewInboxItem[]> {
    const scope = await this.brandAccess.resolve({
      organizationId: input.organizationId,
      userId: input.userId,
    });
    const canResolveWorkflowGates =
      scope.role === null ||
      REVIEW_GATE_ROLES.some((role) => role === scope.role);
    const items = await this.listPending(
      { brandId: input.brandId, organizationId: input.organizationId },
      {
        brandIds: scope.brandIds,
        canResolveMcpApprovals: false,
        canResolveWorkflowGates,
      },
    );
    return items.filter((item) => item.isResolvable);
  }

  async listPending(
    input: ReviewInboxListInput,
    access: ReviewInboxViewerAccess,
  ): Promise<IReviewInboxItem[]> {
    const allowedBrandIds = this.resolveAllowedBrandIds(
      input.brandId ?? null,
      access.brandIds,
    );
    const [gates, approvals, questions] = await Promise.all([
      this.listWorkflowReviewGates(
        input.organizationId,
        allowedBrandIds,
        access,
      ),
      access.canResolveMcpApprovals
        ? this.listMcpApprovals(input.organizationId, allowedBrandIds)
        : Promise.resolve([]),
      this.listAgentQuestions(input.organizationId, allowedBrandIds, access),
    ]);
    const items = [...gates, ...approvals, ...questions];
    const brands = await this.loadBrands(
      input.organizationId,
      items.flatMap((item) => (item.brandId ? [item.brandId] : [])),
    );
    return items
      .map((item) => ({
        ...item,
        brandLabel: item.brandId
          ? (brands.get(item.brandId)?.label ?? null)
          : null,
        brandLogoUrl: item.brandId
          ? (brands.get(item.brandId)?.logoUrl ?? null)
          : null,
      }))
      .sort((left, right) => left.requestedAt.localeCompare(right.requestedAt));
  }

  /**
   * `undefined` means every brand. A brand-scoped view narrows to that brand,
   * and never past what a brand-restricted member may see. Rows without a
   * brand are organization-level and always stay visible.
   */
  private resolveAllowedBrandIds(
    brandId: string | null,
    memberBrandIds: string[] | undefined,
  ): string[] | undefined {
    if (!brandId) return memberBrandIds;
    if (memberBrandIds && !memberBrandIds.includes(brandId)) return [];
    return [brandId];
  }

  private async listWorkflowReviewGates(
    organizationId: string,
    allowedBrandIds: string[] | undefined,
    access: ReviewInboxViewerAccess,
  ): Promise<IReviewInboxItem[]> {
    const executions = await this.prisma.workflowExecution.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        createdAt: true,
        id: true,
        result: true,
        workflow: { select: { brandId: true, id: true, label: true } },
      },
      take: REVIEW_INBOX_SOURCE_LIMIT,
      where: scopedWhere(organizationId, {
        completedAt: null,
        // Only runs paused at a gate, so other RUNNING runs never use up the
        // cap; the parse below still validates what the gate recorded.
        NOT: {
          result: {
            equals: Prisma.AnyNull,
            path: ['metadata', 'pendingApproval', 'nodeId'],
          },
        },
        status: WorkflowExecutionStatus.RUNNING,
        workflow: {
          is: {
            isDeleted: false,
            ...(allowedBrandIds
              ? {
                  OR: [{ brandId: { in: allowedBrandIds } }, { brandId: null }],
                }
              : {}),
          },
        },
      }),
    });

    return executions.flatMap((execution): IReviewInboxItem[] => {
      const result = isRecord(execution.result) ? execution.result : {};
      const metadata = isRecord(result.metadata) ? result.metadata : {};
      const pending = isRecord(metadata.pendingApproval)
        ? metadata.pendingApproval
        : null;
      const nodeId = readString(pending?.nodeId);
      if (!pending || !nodeId) return [];

      const requestedAt =
        readString(pending.requestedAt) ?? execution.createdAt.toISOString();
      const timeoutHours =
        typeof pending.timeoutHours === 'number' && pending.timeoutHours > 0
          ? pending.timeoutHours
          : DEFAULT_REVIEW_GATE_TIMEOUT_HOURS;
      const requestedAtMs = Date.parse(requestedAt);
      const workflowLabel = readString(execution.workflow.label) ?? 'Workflow';
      const preview: IReviewInboxItemPreview = {
        caption: excerpt(readString(pending.inputCaption)),
        mediaUrl: readHttpUrl(pending.inputMedia),
      };

      return [
        {
          actionDetails: null,
          actionSummary: `Continue ${workflowLabel} with the output waiting at its review gate`,
          actionTitle: `Continue ${workflowLabel}`,
          approvalId: null,
          batchCount: null,
          brandId: execution.workflow.brandId ?? null,
          brandLabel: null,
          brandLogoUrl: null,
          estimatedCredits: null,
          executionId: execution.id,
          expiresAt: Number.isFinite(requestedAtMs)
            ? new Date(requestedAtMs + timeoutHours * 3_600_000).toISOString()
            : null,
          id: buildReviewInboxItemId({
            executionId: execution.id,
            kind: 'workflow_review_gate',
            nodeId,
          }),
          isResolvable: access.canResolveWorkflowGates,
          kind: 'workflow_review_gate',
          nodeId,
          preview,
          question: null,
          reasons: [],
          requestedAt,
          requestedByLabel: null,
          // Agent-strategy runs are an agent asking; everything else is the workflow.
          source: readString(metadata.strategyId) ? 'agent' : 'workflow',
          sourceLabel: workflowLabel,
          status: 'pending',
          toolName: null,
          workflowId: execution.workflow.id,
        },
      ];
    });
  }

  private async listMcpApprovals(
    organizationId: string,
    allowedBrandIds: string[] | undefined,
  ): Promise<IReviewInboxItem[]> {
    await expireStaleMcpApprovals(this.prisma.mcpApproval, organizationId);
    const pending = await this.prisma.mcpApproval.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        arguments: true,
        createdAt: true,
        id: true,
        pricingQuote: true,
        toolName: true,
        user: { select: { email: true, firstName: true, lastName: true } },
      },
      take: REVIEW_INBOX_SOURCE_LIMIT,
      where: scopedWhere(organizationId, {
        status: McpApprovalStatus.PENDING,
      }),
    });

    // A scheduling request whose publish times have all passed can no longer be
    // acted on, so it closes itself instead of waiting in the inbox.
    const lateIds = new Set(
      await expireLateSchedulingApprovals(
        this.prisma.mcpApproval,
        organizationId,
        pending,
      ),
    );
    const approvals = pending.filter((approval) => !lateIds.has(approval.id));

    const accountBrandIds = allowedBrandIds
      ? await this.loadBatchAccountBrandIds(organizationId, approvals)
      : new Map<string, string | null>();

    return approvals.flatMap((approval): IReviewInboxItem[] => {
      const args = isRecord(approval.arguments) ? approval.arguments : {};
      const batch = readScheduledReleaseBatch(approval.toolName, args);
      const firstRelease = batch && isRecord(batch[0]) ? batch[0] : null;
      const brandId =
        readString(args.brandId) ?? readString(firstRelease?.brandId);
      // The row names the first release's brand, but a week may span brands:
      // the review page and the approval check every one, so the row is hidden
      // from a member who may not see any of them.
      const rowBrandIds = [
        ...(brandId ? [brandId] : []),
        ...batchBrandIds(batch, accountBrandIds),
      ];
      if (
        allowedBrandIds &&
        rowBrandIds.some((id) => !allowedBrandIds.includes(id))
      ) {
        return [];
      }
      const definition = getToolByName(approval.toolName);
      const caption = (
        firstRelease
          ? [readString(firstRelease.baseContent)]
          : MCP_APPROVAL_CAPTION_ARGUMENT_KEYS.map((key) =>
              readString(args[key]),
            )
      ).find((value): value is string => value !== null);
      const mediaUrl = MEDIA_ARGUMENT_KEYS.map((key) =>
        readHttpUrl(args[key]),
      ).find((value): value is string => value !== null);
      const quote = approvalGenerationQuote(approval.pricingQuote);
      const estimatedCredits =
        quote?.credits ??
        (definition?.creditPricing
          ? estimateToolCreditCost(
              approval.toolName,
              args,
              definition.creditPricing,
            )
          : null);

      const action = batch
        ? {
            details: null,
            title: `Schedule ${batch.length} ${batch.length === 1 ? 'post' : 'posts'}`,
          }
        : describeMcpApprovalAction(approval.toolName, args);
      const requester = [approval.user?.firstName, approval.user?.lastName]
        .map((part) => readString(part))
        .filter((part): part is string => part !== null)
        .join(' ');

      return [
        {
          actionDetails: action.details,
          actionSummary: action.details
            ? `${action.title} · ${action.details}`
            : action.title,
          actionTitle: action.title,
          approvalId: approval.id,
          batchCount: batch ? batch.length : null,
          brandId,
          brandLabel: null,
          brandLogoUrl: null,
          estimatedCredits:
            typeof estimatedCredits === 'number' ? estimatedCredits : null,
          executionId: null,
          expiresAt: null,
          id: buildReviewInboxItemId({
            approvalId: approval.id,
            kind: 'mcp_approval',
          }),
          isResolvable: true,
          kind: 'mcp_approval',
          nodeId: null,
          preview: {
            caption: excerpt(caption ?? null),
            mediaUrl: mediaUrl ?? null,
          },
          question: null,
          reasons: [],
          requestedAt: approval.createdAt.toISOString(),
          requestedByLabel:
            requester || readString(approval.user?.email) || null,
          source: 'mcp_client',
          sourceLabel: approval.toolName,
          status: 'pending',
          toolName: approval.toolName,
          workflowId: null,
        },
      ];
    });
  }

  /**
   * The questions agent runs are waiting on, one row per pending request. The
   * threads come from the indexed `pendingInputAt` column; only their pending
   * requests are then read out of the snapshot. A member sees the questions of
   * the threads they can open (their own, or a live share) and may answer where
   * they can collaborate; brand-limited members never see another brand's.
   */
  private async listAgentQuestions(
    organizationId: string,
    allowedBrandIds: string[] | undefined,
    access: ReviewInboxViewerAccess,
  ): Promise<IReviewInboxItem[]> {
    const actor = access.actor;
    if (!actor) return [];

    const listScope = await this.threadAccess.resolveListScope(actor);
    const ownerWhere = this.threadAccess.buildOwnerWhere(
      actor.userId,
      listScope,
      AgentThreadOwnerFilter.ALL,
    );
    const snapshots = await this.prisma.agentThreadSnapshot.findMany({
      orderBy: { pendingInputAt: 'asc' },
      select: {
        thread: {
          select: { brandId: true, id: true, title: true, userId: true },
        },
        threadId: true,
      },
      take: REVIEW_INBOX_QUESTION_THREAD_LIMIT,
      where: scopedWhere(organizationId, {
        pendingInputAt: { not: null },
        thread: {
          is: {
            AND: [ownerWhere],
            isDeleted: false,
            status: AgentThreadStatus.ACTIVE,
            ...(allowedBrandIds
              ? {
                  OR: [{ brandId: { in: allowedBrandIds } }, { brandId: null }],
                }
              : {}),
          },
        },
      }),
    });
    if (snapshots.length === 0) return [];

    const threads = snapshots.map((snapshot) => snapshot.thread);
    const levels = await this.threadAccess.resolveAccessLevels(
      actor.userId,
      listScope,
      threads,
    );
    const threadIds = threads.map((thread) => thread.id);
    // Only the pending requests leave the database, never the whole snapshot.
    // sql-risk-audit: ignore raw-sql-review -- Bound to organizationId and isDeleted = false, read by the unique (organizationId, threadId) index for at most REVIEW_INBOX_QUESTION_THREAD_LIMIT thread ids, and selects one JSON path instead of the snapshot.
    // A newer question supersedes an older pending one, and the thread's answer
    // route refuses a superseded request, so those ids are read too and left out.
    const rows = await this.prisma.$queryRaw<
      { requests: unknown; superseded: unknown; threadId: string }[]
    >(Prisma.sql`
      SELECT "threadId",
        "data" -> 'pendingInputRequests' AS "requests",
        (
          SELECT COALESCE(jsonb_agg(entry ->> 'requestId'), '[]'::jsonb)
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof("data" -> 'inputRequests') = 'array'
              THEN "data" -> 'inputRequests' ELSE '[]'::jsonb END
          ) AS entry
          WHERE entry ->> 'status' = 'superseded'
        ) AS "superseded"
      FROM "agent_thread_snapshots"
      WHERE "organizationId" = ${organizationId}
        AND "isDeleted" = false
        AND "threadId" IN (${Prisma.join(threadIds)})`);
    const requestsByThread = new Map(
      rows.map((row) => [row.threadId, row.requests]),
    );
    const supersededByThread = new Map(
      rows.map((row) => [
        row.threadId,
        new Set(
          Array.isArray(row.superseded)
            ? row.superseded.filter(
                (id): id is string => typeof id === 'string',
              )
            : [],
        ),
      ]),
    );

    return threads.flatMap((thread): IReviewInboxItem[] => {
      const level = levels.get(thread.id);
      if (!level) return [];
      const requests = requestsByThread.get(thread.id);
      return (Array.isArray(requests) ? requests : []).flatMap(
        (request): IReviewInboxItem[] => {
          const question = readAgentQuestion(thread.id, request);
          if (!question || !isRecord(request)) return [];
          if (supersededByThread.get(thread.id)?.has(question.requestId)) {
            return [];
          }
          const title = readString(request.title) ?? 'Agent question';
          return [
            {
              actionDetails: null,
              actionSummary: title,
              actionTitle: title,
              approvalId: null,
              batchCount: null,
              brandId: thread.brandId ?? null,
              brandLabel: null,
              brandLogoUrl: null,
              estimatedCredits: null,
              executionId: null,
              expiresAt: null,
              id: buildReviewInboxItemId({
                kind: 'agent_input_request',
                requestId: question.requestId,
                threadId: thread.id,
              }),
              isResolvable:
                level === AgentThreadAccessLevel.OWNER ||
                level === AgentThreadAccessLevel.COLLABORATE,
              kind: 'agent_input_request',
              nodeId: null,
              preview: { caption: excerpt(question.prompt), mediaUrl: null },
              question,
              reasons: [],
              requestedAt:
                readValidTimestamp(request.createdAt) ??
                new Date(0).toISOString(),
              requestedByLabel: null,
              source: 'agent',
              sourceLabel: readString(thread.title) ?? 'Agent',
              status: 'pending',
              toolName: null,
              workflowId: null,
            },
          ];
        },
      );
    });
  }

  /**
   * The brand of every channel account a pending week posts to, by account id.
   * An account with no brand maps to null, which no brand-limited member may see.
   */
  private async loadBatchAccountBrandIds(
    organizationId: string,
    approvals: readonly { arguments: unknown; toolName: string }[],
  ): Promise<Map<string, string | null>> {
    const credentialIds = [
      ...new Set(
        approvals.flatMap((approval) =>
          (
            readScheduledReleaseBatch(approval.toolName, approval.arguments) ??
            []
          ).flatMap(releaseCredentialIds),
        ),
      ),
    ];
    if (credentialIds.length === 0) return new Map();
    const credentials = await this.prisma.credential.findMany({
      select: { brandId: true, id: true },
      where: scopedWhere(organizationId, { id: { in: credentialIds } }),
    });
    return new Map(
      credentials.map((credential) => [credential.id, credential.brandId]),
    );
  }

  private async loadBrands(
    organizationId: string,
    brandIds: string[],
  ): Promise<Map<string, { label: string; logoUrl: string | null }>> {
    const uniqueIds = [...new Set(brandIds)];
    if (uniqueIds.length === 0) return new Map();
    const [brands, logoUrls] = await Promise.all([
      this.prisma.brand.findMany({
        select: { id: true, label: true },
        where: scopedWhere(organizationId, { id: { in: uniqueIds } }),
      }),
      resolveBrandLogoCdnUrls(
        this.prisma,
        this.configService.cdnUrl,
        new Map([[organizationId, uniqueIds]]),
      ),
    ]);
    return new Map(
      brands.map((brand) => [
        brand.id,
        { label: brand.label, logoUrl: logoUrls.get(brand.id) ?? null },
      ]),
    );
  }

  private async hasRoles(
    request: RolesGuardRequest,
    roles: MemberRole[],
  ): Promise<boolean> {
    try {
      return await this.rolesGuard.assertRoles(request, roles);
    } catch (error: unknown) {
      if (error instanceof HttpException) return false;
      throw error;
    }
  }
}
