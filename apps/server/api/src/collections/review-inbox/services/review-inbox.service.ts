import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { approvalGenerationQuote } from '@api/collections/mcp-approvals/schemas/mcp-approval-pricing.schema';
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
import { MemberRole } from '@genfeedai/contracts';
import {
  buildReviewInboxItemId,
  type IReviewInboxItem,
  type IReviewInboxItemPreview,
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
import { HttpException, Injectable } from '@nestjs/common';

/** Each source is capped so one noisy producer cannot flood the inbox. */
const REVIEW_INBOX_SOURCE_LIMIT = 200;
const PREVIEW_MAX_LENGTH = 280;
/** Who may decide a workflow review gate, as the workflow approve route allows. */
const REVIEW_GATE_ROLES: MemberRole[] = [
  MemberRole.OWNER,
  MemberRole.ADMIN,
  MemberRole.CREATOR,
];
const DEFAULT_REVIEW_GATE_TIMEOUT_HOURS = 24;
const PRIVATE_ARGUMENT = /secret|password|token|authorization|credential|key/i;
/** Opaque ids say nothing to a reviewer; the brand gets its own column. */
const OPAQUE_ID_ARGUMENT = /(?:Id|Ids|_id)$/;
const CAPTION_ARGUMENT_KEYS = [
  'caption',
  'text',
  'description',
  'content',
  'prompt',
  'title',
] as const;
const MEDIA_ARGUMENT_KEYS = ['mediaUrl', 'imageUrl', 'videoUrl'] as const;

function excerpt(value: string | null): string | null {
  if (!value) return null;
  const text = value.trim();
  return text.length <= PREVIEW_MAX_LENGTH
    ? text
    : `${text.slice(0, PREVIEW_MAX_LENGTH - 1).trimEnd()}…`;
}

function readHttpUrl(value: unknown): string | null {
  const url = readString(value);
  return url && /^https?:\/\//i.test(url) ? url : null;
}

function humanize(value: string): string {
  const text = value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function describeArguments(args: Record<string, unknown>): string {
  return Object.entries(args)
    .filter(
      ([key, value]) =>
        !PRIVATE_ARGUMENT.test(key) &&
        !OPAQUE_ID_ARGUMENT.test(key) &&
        !(CAPTION_ARGUMENT_KEYS as readonly string[]).includes(key) &&
        (typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean') &&
        String(value).trim().length > 0 &&
        String(value).length <= 60,
    )
    .slice(0, 3)
    .map(([key, value]) => `${humanize(key)}: ${String(value)}`)
    .join(' · ');
}

/**
 * Read side of the publishing review inbox (#7340): the workflow review gates
 * and MCP approvals waiting on a human, projected into one row model. Turbo
 * run drafts stay on the Turbo run endpoints.
 */
@Injectable()
export class ReviewInboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandAccess: BrandAccessService,
    private readonly rolesGuard: RolesGuard,
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
    const [gates, approvals] = await Promise.all([
      this.listWorkflowReviewGates(
        input.organizationId,
        allowedBrandIds,
        access,
      ),
      access.canResolveMcpApprovals
        ? this.listMcpApprovals(input.organizationId, allowedBrandIds)
        : Promise.resolve([]),
    ]);
    const items = [...gates, ...approvals];
    const brandLabels = await this.loadBrandLabels(
      input.organizationId,
      items.flatMap((item) => (item.brandId ? [item.brandId] : [])),
    );
    return items
      .map((item) => ({
        ...item,
        brandLabel: item.brandId
          ? (brandLabels.get(item.brandId) ?? null)
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
          actionSummary: `Continue ${workflowLabel} with the output waiting at its review gate`,
          approvalId: null,
          brandId: execution.workflow.brandId ?? null,
          brandLabel: null,
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
          reasons: [],
          requestedAt,
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
    const approvals = await this.prisma.mcpApproval.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        arguments: true,
        createdAt: true,
        id: true,
        pricingQuote: true,
        toolName: true,
      },
      take: REVIEW_INBOX_SOURCE_LIMIT,
      where: scopedWhere(organizationId, {
        status: McpApprovalStatus.PENDING,
      }),
    });

    return approvals.flatMap((approval): IReviewInboxItem[] => {
      const args = isRecord(approval.arguments) ? approval.arguments : {};
      const brandId = readString(args.brandId);
      if (brandId && allowedBrandIds && !allowedBrandIds.includes(brandId)) {
        return [];
      }
      const definition = getToolByName(approval.toolName);
      const title = definition?.title ?? humanize(approval.toolName);
      const details = describeArguments(args);
      const caption = CAPTION_ARGUMENT_KEYS.map((key) =>
        readString(args[key]),
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

      return [
        {
          actionSummary: details ? `${title} · ${details}` : title,
          approvalId: approval.id,
          brandId,
          brandLabel: null,
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
          reasons: [],
          requestedAt: approval.createdAt.toISOString(),
          source: 'mcp_client',
          sourceLabel: approval.toolName,
          status: 'pending',
          toolName: approval.toolName,
          workflowId: null,
        },
      ];
    });
  }

  private async loadBrandLabels(
    organizationId: string,
    brandIds: string[],
  ): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(brandIds)];
    if (uniqueIds.length === 0) return new Map();
    const brands = await this.prisma.brand.findMany({
      select: { id: true, label: true },
      where: scopedWhere(organizationId, { id: { in: uniqueIds } }),
    });
    return new Map(brands.map((brand) => [brand.id, brand.label]));
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
