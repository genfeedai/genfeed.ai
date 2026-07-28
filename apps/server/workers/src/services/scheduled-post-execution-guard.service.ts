import { PostEntity } from '@api/collections/posts/entities/post.entity';
import type { AgentScopeSource } from '@genfeedai/interfaces';
import {
  AgentArtifactReferenceService,
  AgentScopeContextService,
} from '@genfeedai/server';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ScheduledPostExecutionGuardService {
  constructor(
    private readonly agentArtifactReferenceService: AgentArtifactReferenceService,
    private readonly agentScopeContextService: AgentScopeContextService,
  ) {}

  async assertAgentPublishingScope(post: PostEntity): Promise<void> {
    const threadId = this.readPostString(post, ['agentThreadId']);
    if (!threadId) {
      return;
    }

    const record = post as unknown as Record<string, unknown>;
    const contextVersion = record.agentContextVersion;
    const source = record.agentContextSource;
    const organizationId = this.readPostString(post, [
      'organizationId',
      'organization',
    ]);
    const userId = this.readPostString(post, ['userId', 'user']);

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

    const brandId = this.readPostString(post, ['brandId', 'brand']);
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
    const durableVersionPinId = this.readPostString(post, [
      'reviewVersionPinId',
    ]);

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

    const organizationId = this.readPostString(post, [
      'organizationId',
      'organization',
    ]);
    if (!organizationId) {
      throw new Error(
        `Post ${post.id.toString()} is missing an organization for version-pin validation.`,
      );
    }

    const brandId = this.readPostString(post, ['brandId', 'brand']);
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
    return (
      value === 'explicit' ||
      value === 'thread_created' ||
      value === 'legacy_execution_policy' ||
      value === 'legacy_message_history' ||
      value === 'legacy_organization_only'
    );
  }

  private readPostString(
    post: PostEntity,
    keys: readonly string[],
  ): string | undefined {
    const record = post as unknown as Record<string, unknown>;
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
      if (value && typeof value === 'object' && 'id' in value) {
        const id = (value as { id?: unknown }).id;
        if (typeof id === 'string' && id.length > 0) {
          return id;
        }
      }
    }

    return undefined;
  }
}
