import {
  readCredentialId,
  readDomainPlatform,
} from '@api/services/agent-orchestrator/tools/agent-publish-target.util';
import type { CredentialPlatform, PostVisibility } from '@genfeedai/contracts';
import type {
  AgentPublishTargetPayload,
  AgentToolResult,
  PublishConfirmedContentInput,
} from '@genfeedai/contracts/interfaces';

export function resolveConfirmedPublishTargets(params: {
  credentials: PublishConfirmedContentInput['credentials'];
  credentialsById: Map<
    string,
    PublishConfirmedContentInput['credentials'][number]
  >;
  requestedTargets: AgentPublishTargetPayload[] | undefined;
  visibility: PostVisibility;
}):
  | {
      payloads: AgentPublishTargetPayload[];
      targets: Array<{
        credentialId: string;
        platform: CredentialPlatform;
      }>;
    }
  | { error: AgentToolResult } {
  if (params.requestedTargets && params.requestedTargets.length > 0) {
    const payloads: AgentPublishTargetPayload[] = [];
    const targets: Array<{
      credentialId: string;
      platform: CredentialPlatform;
    }> = [];

    for (const requested of params.requestedTargets) {
      const credential = params.credentialsById.get(requested.credentialId);
      const platform =
        readDomainPlatform(credential?.platform) ??
        readDomainPlatform(requested.platform);
      if (!credential || !platform) {
        return {
          error: {
            creditsUsed: 0,
            error: `Missing connected accounts for: ${requested.platform}.`,
            success: false,
          },
        };
      }

      payloads.push({
        ...requested,
        platform,
        visibility: requested.visibility ?? params.visibility,
      });
      targets.push({
        credentialId: requested.credentialId,
        platform,
      });
    }

    return { payloads, targets };
  }

  const payloads: AgentPublishTargetPayload[] = [];
  const targets: Array<{
    credentialId: string;
    platform: CredentialPlatform;
  }> = [];

  for (const credential of params.credentials) {
    const credentialId = readCredentialId(credential.id);
    const platform = readDomainPlatform(credential.platform);
    if (!credentialId || !platform) {
      continue;
    }

    payloads.push({
      credentialId,
      platform,
      visibility: params.visibility,
    });
    targets.push({ credentialId, platform });
  }

  return { payloads, targets };
}
