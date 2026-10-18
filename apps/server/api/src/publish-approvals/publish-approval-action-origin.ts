import {
  getActionOriginContext,
  normalizeActionOrigin,
  withActionOriginMetadata,
} from '@api/action-origin/action-origin.context';
import { ActionOrigin } from '@genfeedai/contracts';

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

/** The origin recorded on an approval's provenance when it was minted. */
export function readProvenanceOrigin(
  provenance: unknown,
): ReturnType<typeof normalizeActionOrigin> {
  return normalizeActionOrigin(
    provenance !== null &&
      typeof provenance === 'object' &&
      !Array.isArray(provenance)
      ? (provenance as Record<string, unknown>).origin
      : undefined,
  );
}

/** Only a request an interactive member made in the app counts as a human approval. */
export function isInteractiveApprovalOrigin(
  origin: ReturnType<typeof normalizeActionOrigin>,
): boolean {
  return origin === ActionOrigin.UI;
}

/**
 * Origins whose publishes the brand Policy binds at the approval (#7339): a
 * workflow or an MCP client publishing without a member in the app. Agent
 * runs are bound earlier, where the agent decides to publish.
 */
export function isPolicyBoundApprovalOrigin(
  origin: ReturnType<typeof normalizeActionOrigin>,
): boolean {
  return origin === ActionOrigin.WORKFLOW || origin === ActionOrigin.MCP;
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
