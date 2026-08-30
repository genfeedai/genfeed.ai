import {
  AGENT_SCOPE_SOURCES,
  type AgentScopeSource,
} from '@genfeedai/interfaces';
import {
  AgentArtifactReferenceService,
  AgentScopeContextService,
} from '@genfeedai/server';
import { Injectable } from '@nestjs/common';
import { PostEntity } from '@server/collections/posts/entities/post.entity';
import { readPostString } from '@workers/services/scheduled-post.utils';

const AGENT_SCOPE_SOURCE_SET: ReadonlySet<unknown> = new Set(
  AGENT_SCOPE_SOURCES,
);

@Injectable()
export class ScheduledPostExecutionGuardService {
  constructor(
    private readonly agentArtifactReferenceService: AgentArtifactReferenceService,
    private readonly agentScopeContextService: AgentScopeContextService,
  ) {}

  async assertAgentPublishingScope(post: PostEntity): Promise<void> {
    const threadId = readPostString(post, ['agentThreadId']);
    if (!threadId) {
      return;
    }

    const record = post as unknown as Record<string, unknown>;
    const contextVersion = record.agentContextVersion;
    const source = record.agentContextSource;
    const organizationId = readPostString(post, ['organizationId']);
    const userId = readPostString(post, ['userId']);

    if (
      typeof contextVersion !== 'number' ||
      !this.isAgentScopeSource(source) ||
      !organizationId ||
      !userId
    ) {
      throw new Error(
        `Post ${post.id.toString()} has an incomplete durable agent scope.`,
      );
    }

    const brandId = readPostString(post, ['brandId']);
    const scope = {
      brandId,
      contextVersion,
      isLegacyFallback: source.startsWith('legacy_'),
      isVersionExplicit: true,
      organizationId,
      source,
      threadId,
      userId,
    };

    await this.agentScopeContextService.assertConsequentialBoundary(
      scope,
      'publish',
    );
    this.agentScopeContextService.assertResourceBrand(
      scope,
      brandId,
      'queued post',
    );
  }

  async assertPublishVersionPin(
    post: PostEntity,
    queuedVersionPinId?: string,
  ): Promise<void> {
    const durableVersionPinId = readPostString(post, ['reviewVersionPinId']);

    if (queuedVersionPinId && !durableVersionPinId) {
      throw new Error(
        `Queued version pin ${queuedVersionPinId} has no durable review pin on post ${post.id.toString()}.`,
      );
    }

    if (
      queuedVersionPinId &&
      durableVersionPinId &&
      queuedVersionPinId !== durableVersionPinId
    ) {
      throw new Error(
        `Queued version pin ${queuedVersionPinId} does not match post ${post.id.toString()} review pin ${durableVersionPinId}.`,
      );
    }

    const versionPinId = queuedVersionPinId ?? durableVersionPinId;
    if (!versionPinId) {
      return;
    }

    const organizationId = readPostString(post, ['organizationId']);
    if (!organizationId) {
      throw new Error(
        `Post ${post.id.toString()} is missing an organization for version-pin validation.`,
      );
    }

    const brandId = readPostString(post, ['brandId']);
    const resolved =
      await this.agentArtifactReferenceService.assertVersionPinCurrent({
        pinId: versionPinId,
        readContext: {
          ...(brandId ? { brandId } : {}),
          organizationId,
        },
      });

    if (
      resolved.reference.kind !== 'post' ||
      resolved.reference.recordId !== post.id.toString()
    ) {
      throw new Error(
        `Version pin ${versionPinId} does not reference post ${post.id.toString()}.`,
      );
    }
  }

  private isAgentScopeSource(value: unknown): value is AgentScopeSource {
    return AGENT_SCOPE_SOURCE_SET.has(value);
  }
}
