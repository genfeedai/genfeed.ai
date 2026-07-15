import { randomUUID } from 'node:crypto';
import type {
  AgentScopeSource,
  ValidatedAgentScope,
} from '@genfeedai/interfaces';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import {
  SERVER_TOKENS,
  type ServerLogger,
  type ServerPrisma,
} from '@server/server.dependencies';

const MAX_SCOPE_PROVENANCE_ENTRIES = 50;
const MAX_LEGACY_BRAND_FALLBACK_USES = 20;

function agentThreadNotFound(threadId: string): HttpException {
  return new HttpException(
    {
      detail: `Agent thread with identifier '${threadId}' not found`,
      source: { parameter: threadId },
      title: 'Resource Not Found',
    },
    HttpStatus.NOT_FOUND,
  );
}

type ScopeMutationSource = 'thread_context_api' | 'thread_created';

interface AgentScopeProvenanceEntry {
  acceptedAt: string;
  actorUserId: string;
  brandId: string | null;
  fromContextVersion: number;
  id: string;
  previousBrandId: string | null;
  source: ScopeMutationSource;
  toContextVersion: number;
}

interface AgentThreadScopeRow {
  brandId: string | null;
  contextVersion: number;
  id: string;
  isDeleted: boolean;
  isLegacyBrandFallbackEligible: boolean;
  legacyBrandFallbackCount: number;
  legacyBrandFallbackLastBrandId: string | null;
  legacyBrandFallbackLastSource: string | null;
  organizationId: string;
  scopeChangeProvenance: unknown;
  userId: string;
}

export interface PrepareAgentScopeParams {
  expectedContextVersion?: number;
  organizationId: string;
  policyBrandId?: string;
  requestedBrandId?: string | null;
  threadId?: string;
  userId: string;
}

export interface PreparedAgentScope {
  existingScope?: ValidatedAgentScope;
  initialBrandId?: string;
  initialScopeFields: Record<string, unknown>;
}

export interface MutateAgentScopeParams {
  brandId?: string | null;
  expectedContextVersion: number;
  organizationId: string;
  threadId: string;
  userId: string;
}

@Injectable()
export class AgentScopeContextService {
  constructor(
    @Inject(SERVER_TOKENS.prisma)
    private readonly prisma: Pick<
      ServerPrisma,
      'agentMessage' | 'agentThread' | 'brand'
    >,
    @Inject(SERVER_TOKENS.logger)
    @Optional()
    private readonly logger?: ServerLogger,
  ) {}

  async prepareForTurn(
    params: PrepareAgentScopeParams,
  ): Promise<PreparedAgentScope> {
    const thread = params.threadId
      ? await this.findThread(
          params.threadId,
          params.organizationId,
          params.userId,
        )
      : null;

    if (params.threadId && !thread) {
      throw agentThreadNotFound(params.threadId);
    }

    if (!thread) {
      const initialBrandId =
        this.normalizeBrandId(params.requestedBrandId) ?? params.policyBrandId;

      if (
        params.requestedBrandId &&
        params.policyBrandId &&
        params.requestedBrandId !== params.policyBrandId
      ) {
        throw new ForbiddenException(
          'Requested brand is outside the resolved agent execution policy.',
        );
      }

      if (initialBrandId) {
        await this.assertBrandAuthorized(initialBrandId, params.organizationId);
      }

      return {
        initialBrandId,
        initialScopeFields: this.buildInitialScopeFields(
          initialBrandId,
          params.userId,
        ),
      };
    }

    this.assertExpectedVersion(thread, params.expectedContextVersion);
    this.assertRequestedScopeMatches(thread, params.requestedBrandId);

    if (
      thread.brandId &&
      params.policyBrandId &&
      thread.brandId !== params.policyBrandId
    ) {
      throw new ForbiddenException(
        'Thread brand is outside the resolved agent execution policy.',
      );
    }

    if (thread.brandId) {
      await this.assertBrandAuthorized(thread.brandId, params.organizationId);
      this.recordCompatibilityRead(
        'current',
        'explicit_thread_scope',
        params.organizationId,
      );
      return {
        existingScope: this.toValidatedScope(
          thread,
          thread.brandId,
          'explicit',
          params.expectedContextVersion !== undefined,
        ),
        initialScopeFields: {},
      };
    }

    if (!thread.isLegacyBrandFallbackEligible) {
      this.recordCompatibilityRead(
        'current',
        'explicit_thread_scope',
        params.organizationId,
      );
      return {
        existingScope: this.toValidatedScope(
          thread,
          undefined,
          'explicit',
          params.expectedContextVersion !== undefined,
        ),
        initialScopeFields: {},
      };
    }

    if (thread.legacyBrandFallbackCount >= MAX_LEGACY_BRAND_FALLBACK_USES) {
      throw this.legacyFallbackExpired(thread);
    }

    const fallback = await this.resolveLegacyFallbackBrand(
      thread,
      params.policyBrandId,
    );
    await this.recordLegacyFallback(thread, fallback.brandId, fallback.source);

    return {
      existingScope: this.toValidatedScope(
        thread,
        fallback.brandId,
        fallback.source,
        params.expectedContextVersion !== undefined,
        true,
      ),
      initialScopeFields: {},
    };
  }

  async resolveCreatedThreadScope(params: {
    brandId?: string;
    organizationId: string;
    threadId: string;
    userId: string;
  }): Promise<ValidatedAgentScope> {
    const thread = await this.findThread(
      params.threadId,
      params.organizationId,
      params.userId,
    );

    if (!thread) {
      throw agentThreadNotFound(params.threadId);
    }

    if (thread.brandId !== (params.brandId ?? null)) {
      throw this.contextConflict(thread);
    }

    return this.toValidatedScope(
      thread,
      params.brandId,
      'thread_created',
      true,
    );
  }

  async mutateBrandScope(
    params: MutateAgentScopeParams,
  ): Promise<Record<string, unknown>> {
    const thread = await this.findThread(
      params.threadId,
      params.organizationId,
      params.userId,
    );

    if (!thread) {
      throw agentThreadNotFound(params.threadId);
    }

    this.assertExpectedVersion(thread, params.expectedContextVersion);

    const nextBrandId = this.normalizeBrandId(params.brandId) ?? null;
    if (nextBrandId) {
      await this.assertBrandAuthorized(nextBrandId, params.organizationId);
    }

    if (
      thread.brandId === nextBrandId &&
      !thread.isLegacyBrandFallbackEligible
    ) {
      const unchanged = await this.prisma.agentThread.findFirst({
        where: {
          id: params.threadId,
          isDeleted: false,
          organizationId: params.organizationId,
          userId: params.userId,
        },
      });

      if (!unchanged) {
        throw agentThreadNotFound(params.threadId);
      }

      return unchanged as unknown as Record<string, unknown>;
    }

    const provenance = this.readProvenance(thread.scopeChangeProvenance);
    const entry: AgentScopeProvenanceEntry = {
      acceptedAt: new Date().toISOString(),
      actorUserId: params.userId,
      brandId: nextBrandId,
      fromContextVersion: thread.contextVersion,
      id: randomUUID(),
      previousBrandId: thread.brandId,
      source: 'thread_context_api',
      toContextVersion: thread.contextVersion + 1,
    };
    const nextProvenance = [...provenance, entry].slice(
      -MAX_SCOPE_PROVENANCE_ENTRIES,
    );

    const result = await this.prisma.agentThread.updateMany({
      data: {
        brandId: nextBrandId,
        contextVersion: { increment: 1 },
        isLegacyBrandFallbackEligible: false,
        scopeChangeProvenance: nextProvenance as never,
      },
      where: {
        contextVersion: params.expectedContextVersion,
        id: params.threadId,
        isDeleted: false,
        organizationId: params.organizationId,
        userId: params.userId,
      },
    });

    if (result.count !== 1) {
      const latest = await this.findThread(
        params.threadId,
        params.organizationId,
        params.userId,
      );
      throw latest
        ? this.contextConflict(latest)
        : agentThreadNotFound(params.threadId);
    }

    const updated = await this.prisma.agentThread.findFirst({
      where: {
        id: params.threadId,
        isDeleted: false,
        organizationId: params.organizationId,
        userId: params.userId,
      },
    });

    if (!updated) {
      throw agentThreadNotFound(params.threadId);
    }

    this.logger?.log('conversation_shell_scope_correction', {
      organizationId: params.organizationId,
      outcome: 'success',
      source: 'thread_context_api',
      telemetryQueryVersion: 1,
    });

    return updated as unknown as Record<string, unknown>;
  }

  async assertConsequentialBoundary(
    scope: ValidatedAgentScope,
    boundary: 'publish' | 'tool' | 'workflow',
  ): Promise<void> {
    try {
      if (
        !scope.isVersionExplicit &&
        !scope.isLegacyFallback &&
        scope.source !== 'thread_created'
      ) {
        throw new ConflictException({
          code: 'agent_context_version_required',
          contextVersion: scope.contextVersion,
          detail: `expectedContextVersion is required before ${boundary} execution.`,
          title: 'Agent context synchronization required',
        });
      }

      const current = await this.findThread(
        scope.threadId,
        scope.organizationId,
        scope.userId,
      );

      if (!current) {
        throw new ForbiddenException('Agent scope is no longer authorized.');
      }

      if (
        current.contextVersion !== scope.contextVersion ||
        current.brandId !==
          (scope.isLegacyFallback ? null : (scope.brandId ?? null)) ||
        (scope.isLegacyFallback &&
          (current.legacyBrandFallbackLastBrandId !== (scope.brandId ?? null) ||
            current.legacyBrandFallbackLastSource !== scope.source))
      ) {
        throw this.contextConflict(current);
      }

      if (scope.brandId) {
        await this.assertBrandAuthorized(scope.brandId, scope.organizationId);
      }

      this.recordConsequentialAttempt(
        boundary,
        'allowed',
        'current',
        scope.organizationId,
      );
    } catch (error: unknown) {
      this.recordConsequentialAttempt(
        boundary,
        'blocked',
        this.classifyConsequentialContextStatus(error),
        scope.organizationId,
      );
      throw error;
    }
  }

  assertResourceBrand(
    scope: ValidatedAgentScope,
    resourceBrandId: string | null | undefined,
    resourceLabel: string,
  ): void {
    if (!scope.brandId) {
      this.recordBlockedScopeAttempt('missing_brand', scope.organizationId);
      throw new BadRequestException(
        `An explicit brand context is required for ${resourceLabel}.`,
      );
    }

    if (!resourceBrandId || resourceBrandId !== scope.brandId) {
      this.recordBlockedScopeAttempt('brand_mismatch', scope.organizationId);
      throw new ForbiddenException(
        `${resourceLabel} is outside the validated thread brand scope.`,
      );
    }
  }

  async assertBrandAuthorized(
    brandId: string,
    organizationId: string,
  ): Promise<void> {
    const brand = await this.prisma.brand.findFirst({
      select: { id: true },
      where: { id: brandId, isDeleted: false, organizationId },
    });

    if (!brand) {
      throw new ForbiddenException(
        'Requested brand is not available in the authenticated organization.',
      );
    }
  }

  private async findThread(
    threadId: string,
    organizationId: string,
    userId: string,
  ): Promise<AgentThreadScopeRow | null> {
    return (await this.prisma.agentThread.findFirst({
      select: {
        brandId: true,
        contextVersion: true,
        id: true,
        isDeleted: true,
        isLegacyBrandFallbackEligible: true,
        legacyBrandFallbackCount: true,
        legacyBrandFallbackLastBrandId: true,
        legacyBrandFallbackLastSource: true,
        organizationId: true,
        scopeChangeProvenance: true,
        userId: true,
      },
      where: { id: threadId, isDeleted: false, organizationId, userId },
    })) as AgentThreadScopeRow | null;
  }

  private async resolveLegacyFallbackBrand(
    thread: AgentThreadScopeRow,
    policyBrandId?: string,
  ): Promise<{
    brandId?: string;
    source: Extract<AgentScopeSource, `legacy_${string}`>;
  }> {
    if (policyBrandId) {
      await this.assertBrandAuthorized(policyBrandId, thread.organizationId);
      return {
        brandId: policyBrandId,
        source: 'legacy_execution_policy',
      };
    }

    const latestBrandedMessage = await this.prisma.agentMessage.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { brandId: true },
      where: {
        brandId: { not: null },
        isDeleted: false,
        organizationId: thread.organizationId,
        threadId: thread.id,
      },
    });
    const messageBrandId = latestBrandedMessage?.brandId ?? undefined;

    if (messageBrandId) {
      await this.assertBrandAuthorized(messageBrandId, thread.organizationId);
      return {
        brandId: messageBrandId,
        source: 'legacy_message_history',
      };
    }

    return { source: 'legacy_organization_only' };
  }

  private async recordLegacyFallback(
    thread: AgentThreadScopeRow,
    brandId: string | undefined,
    source: Extract<AgentScopeSource, `legacy_${string}`>,
  ): Promise<void> {
    const result = await this.prisma.agentThread.updateMany({
      data: {
        legacyBrandFallbackCount: { increment: 1 },
        legacyBrandFallbackLastBrandId: brandId ?? null,
        legacyBrandFallbackLastSource: source,
        legacyBrandFallbackLastUsedAt: new Date(),
      },
      where: {
        brandId: null,
        contextVersion: thread.contextVersion,
        id: thread.id,
        isDeleted: false,
        isLegacyBrandFallbackEligible: true,
        legacyBrandFallbackCount: {
          lt: MAX_LEGACY_BRAND_FALLBACK_USES,
        },
        organizationId: thread.organizationId,
        userId: thread.userId,
      },
    });

    if (result.count !== 1) {
      throw this.legacyFallbackExpired(thread);
    }

    this.recordCompatibilityRead('legacy', source, thread.organizationId);
  }

  private buildInitialScopeFields(
    brandId: string | undefined,
    userId: string,
  ): Record<string, unknown> {
    if (!brandId) {
      return {
        contextVersion: 1,
        isLegacyBrandFallbackEligible: false,
        scopeChangeProvenance: [],
      };
    }

    const entry: AgentScopeProvenanceEntry = {
      acceptedAt: new Date().toISOString(),
      actorUserId: userId,
      brandId,
      fromContextVersion: 0,
      id: randomUUID(),
      previousBrandId: null,
      source: 'thread_created',
      toContextVersion: 1,
    };

    return {
      brandId,
      contextVersion: 1,
      isLegacyBrandFallbackEligible: false,
      scopeChangeProvenance: [entry],
    };
  }

  private toValidatedScope(
    thread: AgentThreadScopeRow,
    brandId: string | undefined,
    source: AgentScopeSource,
    isVersionExplicit: boolean,
    isLegacyFallback = false,
  ): ValidatedAgentScope {
    return {
      brandId,
      contextVersion: thread.contextVersion,
      isLegacyFallback,
      isVersionExplicit,
      organizationId: thread.organizationId,
      provenanceId: this.readProvenance(thread.scopeChangeProvenance).at(-1)
        ?.id,
      source,
      threadId: thread.id,
      userId: thread.userId,
    };
  }

  private readProvenance(value: unknown): AgentScopeProvenanceEntry[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter(
      (entry): entry is AgentScopeProvenanceEntry =>
        Boolean(entry) &&
        typeof entry === 'object' &&
        typeof (entry as AgentScopeProvenanceEntry).id === 'string',
    );
  }

  private assertExpectedVersion(
    thread: AgentThreadScopeRow,
    expectedContextVersion?: number,
  ): void {
    if (
      expectedContextVersion !== undefined &&
      expectedContextVersion !== thread.contextVersion
    ) {
      throw this.contextConflict(thread);
    }
  }

  private assertRequestedScopeMatches(
    thread: AgentThreadScopeRow,
    requestedBrandId?: string | null,
  ): void {
    if (requestedBrandId === undefined) {
      return;
    }

    if ((this.normalizeBrandId(requestedBrandId) ?? null) !== thread.brandId) {
      throw this.contextConflict(thread);
    }
  }

  private contextConflict(thread: AgentThreadScopeRow): ConflictException {
    this.logger?.log('conversation_shell_stale_context_blocked', {
      organizationId: thread.organizationId,
      outcome: 'blocked',
      telemetryQueryVersion: 1,
    });
    return new ConflictException({
      code: 'agent_context_version_conflict',
      context: {
        brandId:
          thread.brandId ?? thread.legacyBrandFallbackLastBrandId ?? null,
        contextVersion: thread.contextVersion,
        source:
          thread.brandId !== null
            ? 'explicit'
            : thread.legacyBrandFallbackLastSource,
        organizationId: thread.organizationId,
        threadId: thread.id,
      },
      detail:
        'Agent context is stale or disagrees with the server-authoritative thread scope.',
      title: 'Agent context synchronization required',
    });
  }

  private legacyFallbackExpired(
    thread: AgentThreadScopeRow,
  ): ConflictException {
    return new ConflictException({
      code: 'legacy_agent_context_upgrade_required',
      context: {
        brandId:
          thread.brandId ?? thread.legacyBrandFallbackLastBrandId ?? null,
        contextVersion: thread.contextVersion,
        organizationId: thread.organizationId,
        threadId: thread.id,
      },
      detail:
        'Legacy brand inference has reached its compatibility limit. Set the thread brand explicitly before continuing.',
      title: 'Agent context upgrade required',
    });
  }

  private normalizeBrandId(value?: string | null): string | undefined {
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
  }

  private recordBlockedScopeAttempt(
    reason: 'brand_mismatch' | 'missing_brand',
    organizationId: string,
  ): void {
    this.logger?.log('conversation_shell_scope_violation_blocked', {
      organizationId,
      outcome: 'blocked',
      reason,
      telemetryQueryVersion: 1,
    });
  }

  private recordCompatibilityRead(
    resolution: 'current' | 'legacy',
    source:
      | 'explicit_thread_scope'
      | 'legacy_execution_policy'
      | 'legacy_message_history'
      | 'legacy_organization_only'
      | 'legacy_scope_provenance',
    organizationId: string,
  ): void {
    this.logger?.log('agent_context_compatibility_read', {
      organizationId,
      resolution,
      source,
      telemetryQueryVersion: 1,
    });
  }

  private recordConsequentialAttempt(
    boundary: 'publish' | 'tool' | 'workflow',
    outcome: 'allowed' | 'blocked',
    contextStatus:
      | 'blocked_unknown'
      | 'current'
      | 'missing_version'
      | 'stale'
      | 'unauthorized_scope',
    organizationId: string,
  ): void {
    this.logger?.log('conversation_shell_consequential_attempt', {
      boundary,
      contextStatus,
      organizationId,
      outcome,
      telemetryQueryVersion: 1,
    });
  }

  private classifyConsequentialContextStatus(
    error: unknown,
  ): 'blocked_unknown' | 'missing_version' | 'stale' | 'unauthorized_scope' {
    if (error instanceof ForbiddenException) {
      return 'unauthorized_scope';
    }
    if (error instanceof ConflictException) {
      const response = error.getResponse();
      const code =
        response && typeof response === 'object' && 'code' in response
          ? response.code
          : null;
      if (code === 'agent_context_version_conflict') {
        return 'stale';
      }
      if (code === 'agent_context_version_required') {
        return 'missing_version';
      }
    }
    return 'blocked_unknown';
  }
}
