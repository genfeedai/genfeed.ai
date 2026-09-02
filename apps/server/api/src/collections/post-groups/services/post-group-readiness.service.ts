import { CredentialPublishingReadinessService } from '@api/collections/credentials/services/credential-publishing-readiness.service';
import type { SchedulerTx } from '@api/collections/post-groups/services/post-group.types';
import { formatPlatformLabel } from '@genfeedai/contracts';
import type { IPublishingProviderReadiness } from '@genfeedai/contracts/interfaces';
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
   *
   * Every payload carries an explicit `message`: Nest's `HttpException` only
   * adopts a response object's message when that key holds a string, so
   * omitting it degrades `error.message` to the literal
   * `'Bad Request Exception'`. The HTTP surface never saw that — the filter
   * renders `detail` — but in-process callers such as the agent publish tool
   * report `error.message` verbatim to the user.
   */
  assertSchedulable(
    target: SchedulerReadinessTarget,
    readiness: IPublishingProviderReadiness | undefined,
  ): void {
    const channel = formatPlatformLabel(target.platform) ?? target.platform;

    if (!readiness) {
      throw new BadRequestException({
        credentialId: target.credentialId,
        detail: `Publishing readiness for ${target.credentialId} on ${target.platform} could not be resolved.`,
        message: `${channel}: publishing readiness could not be resolved for this channel.`,
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
    const detail =
      blocking?.message ??
      `Target ${target.credentialId} on ${target.platform} is not ready to publish.`;

    throw new BadRequestException({
      classification: blocking?.classification ?? 'unknown',
      credentialId: target.credentialId,
      detail,
      diagnostics: readiness.diagnostics,
      isRetryable: readiness.isRetryable,
      // The corrective action is the half a user can act on, so it belongs in
      // the sentence that reaches them — not only in the structured payload.
      message: [`${channel}: ${detail}`, readiness.requiredAction]
        .filter(Boolean)
        .join(' '),
      platform: target.platform,
      readinessState: readiness.state,
      requiredAction: readiness.requiredAction,
      title: 'Channel not ready to publish',
    });
  }
}
