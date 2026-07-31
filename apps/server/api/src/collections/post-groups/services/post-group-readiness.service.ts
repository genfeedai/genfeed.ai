import { CredentialPublishingReadinessService } from '@api/collections/credentials/services/credential-publishing-readiness.service';
import type { SchedulerTx } from '@api/collections/post-groups/services/post-group.types';
import type { IPublishingProviderReadiness } from '@genfeedai/interfaces';
import { BadRequestException, Injectable } from '@nestjs/common';

export type SchedulerReadinessTarget = {
  credentialId: string;
  platform: string;
};

@Injectable()
export class PostGroupReadinessService {
  constructor(
    private readonly readinessService: CredentialPublishingReadinessService,
  ) {}

  /**
   * Readiness for every credential backing a channel target, resolved inside
   * the scheduler's write transaction so the verdict and the rows it gates
   * come from one snapshot. The derivation itself is shared with every read
   * surface — see `CredentialPublishingReadinessService.resolveForCredentials`.
   */
  async resolveForCredentials(
    tx: Pick<SchedulerTx, 'credential'>,
    organizationId: string,
    credentialIds: readonly string[],
  ): Promise<Map<string, IPublishingProviderReadiness>> {
    return this.readinessService.resolveForCredentials(
      tx,
      organizationId,
      credentialIds,
    );
  }

  /**
   * Blocks a target before any publish work is queued when its provider
   * readiness says the channel cannot publish.
   */
  assertSchedulable(
    target: SchedulerReadinessTarget,
    readiness: IPublishingProviderReadiness | undefined,
  ): void {
    if (!readiness) {
      throw new BadRequestException({
        credentialId: target.credentialId,
        detail: `Publishing readiness for ${target.credentialId} on ${target.platform} could not be resolved.`,
        platform: target.platform,
        title: 'Channel readiness unavailable',
      });
    }

    if (readiness.canSchedule) {
      return;
    }

    const blocking = readiness.diagnostics.find(
      (diagnostic) => diagnostic.severity === 'error',
    );

    throw new BadRequestException({
      classification: blocking?.classification ?? 'unknown',
      credentialId: target.credentialId,
      detail:
        blocking?.message ??
        `Target ${target.credentialId} on ${target.platform} is not ready to publish.`,
      diagnostics: readiness.diagnostics,
      isRetryable: readiness.isRetryable,
      platform: target.platform,
      readinessState: readiness.state,
      requiredAction: readiness.requiredAction,
      title: 'Channel not ready to publish',
    });
  }
}
