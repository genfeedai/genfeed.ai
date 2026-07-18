import {
  getActionOriginContext,
  normalizeActionOrigin,
  withActionOriginMetadata,
} from '@server/action-origin/action-origin.context';

export function buildApprovalProvenance(
  provenance: Record<string, unknown> | undefined,
  actorUserId: string,
): Record<string, unknown> {
  const context = getActionOriginContext();
  return withActionOriginMetadata(
    {
      contractVersion: 1,
      source: 'typed-publish-approval',
      ...(provenance ?? {}),
    },
    {
      ...context,
      actorUserId: context.actorUserId ?? actorUserId,
    },
  );
}

export function readApprovalOrigin(): ReturnType<typeof normalizeActionOrigin> {
  return getActionOriginContext().origin;
}

export function restoreApprovalProvenance(
  provenance: Record<string, unknown>,
  actorUserId: string,
): Record<string, unknown> {
  return withActionOriginMetadata(provenance, {
    actorUserId:
      typeof provenance.actorUserId === 'string'
        ? provenance.actorUserId
        : actorUserId,
    ...(typeof provenance.apiKeyId === 'string'
      ? { apiKeyId: provenance.apiKeyId }
      : {}),
    origin: normalizeActionOrigin(provenance.origin),
  });
}
