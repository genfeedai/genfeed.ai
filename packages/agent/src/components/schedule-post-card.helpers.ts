import { ReleaseAttachmentKind } from '@genfeedai/contracts';
import type {
  AgentPublishTargetProposal,
  IPostingSetTarget,
  IPostingSignature,
} from '@genfeedai/contracts/interfaces';
import type { ExpandedPostingSetTarget } from '@props/content/posting-sets.props';

export function readActionTimezone(
  actionTimezone: unknown,
  fallback: string,
): string {
  return typeof actionTimezone === 'string' && actionTimezone.trim().length > 0
    ? actionTimezone.trim()
    : fallback;
}

export function readAvailablePlatforms(
  availablePlatforms: unknown,
  platforms: string[] | undefined,
): string[] {
  if (Array.isArray(availablePlatforms)) {
    return availablePlatforms.filter(
      (platform): platform is string =>
        typeof platform === 'string' && platform.trim().length > 0,
    );
  }
  return platforms ?? [];
}

export function buildSignatureAttachments(params: {
  platform: string;
  selectedIds: readonly string[];
  signatures: readonly IPostingSignature[];
}): Array<{
  body: string;
  kind: typeof ReleaseAttachmentKind.SIGNATURE;
  order: number;
  platform: string;
}> {
  const selected = new Set(params.selectedIds);
  return params.signatures
    .filter((signature) => selected.has(signature.id))
    .map((signature, order) => ({
      body: signature.body,
      kind: ReleaseAttachmentKind.SIGNATURE,
      order,
      platform: params.platform,
    }));
}

export function postingSetTargetsFromSelection(params: {
  targets: readonly Pick<
    AgentPublishTargetProposal,
    'credentialId' | 'platform' | 'signatureIds' | 'timezone'
  >[];
}): IPostingSetTarget[] {
  return params.targets.map((target, order) => ({
    credentialId: target.credentialId,
    order,
    platform: target.platform as IPostingSetTarget['platform'],
    ...(target.signatureIds && target.signatureIds.length > 0
      ? { signatureIds: [...target.signatureIds] }
      : {}),
    targetKey: `${target.platform}:${target.credentialId}`,
    ...(target.timezone ? { timezone: target.timezone } : {}),
  }));
}

export function credentialIdsFromExpandedTargets(
  targets: readonly ExpandedPostingSetTarget[],
): string[] {
  return targets
    .map((target) => target.credentialId)
    .filter((credentialId) => credentialId.trim().length > 0);
}

export function isHealthyReferenceState(state: string | undefined): boolean {
  return !state || state === 'valid';
}
