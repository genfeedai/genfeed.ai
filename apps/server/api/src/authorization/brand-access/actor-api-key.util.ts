import {
  MCP_CAN_SWITCH_ORGANIZATIONS_METADATA_KEY,
  MCP_OAUTH_SESSION_KIND,
} from '@genfeedai/contracts/constants';
import type { Prisma } from '@genfeedai/prisma';

export interface ActorApiKeyLookup {
  apiKeyId?: string;
  organizationId: string;
  userId: string;
}

export interface ActorApiKey {
  metadata: Prisma.JsonValue;
  scopes: string[];
}

function isSwitchableMcpSession(metadata: Prisma.JsonValue): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return false;
  }
  return (
    metadata.kind === MCP_OAUTH_SESSION_KIND &&
    metadata[MCP_CAN_SWITCH_ORGANIZATIONS_METADATA_KEY] === true
  );
}

/**
 * Reads the live API key behind an actor. The key row keeps the organization
 * it was issued for, while a switchable MCP session acts in another
 * organization of its user (`actor.organizationId`). So the key is found by
 * id and owner, and it counts only when it was issued for the acting
 * organization or is a session its user let switch organizations. Membership
 * in the acting organization is the caller's own check.
 *
 * Organization is a root model, so reading the key through it does not
 * inherit the request tenant, which is the acting organization here.
 */
export async function findActorApiKey(
  tx: Prisma.TransactionClient,
  actor: ActorApiKeyLookup,
): Promise<ActorApiKey | null> {
  if (!actor.apiKeyId?.trim()) {
    return null;
  }
  const keyWhere: Prisma.ApiKeyWhereInput = {
    id: actor.apiKeyId,
    userId: actor.userId,
    isRevoked: false,
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  };
  const issuer = await tx.organization.findFirst({
    where: { apiKeys: { some: keyWhere } },
    select: {
      id: true,
      apiKeys: { where: keyWhere, select: { metadata: true, scopes: true } },
    },
  });
  const key = issuer?.apiKeys[0];
  if (!issuer || !key) {
    return null;
  }
  if (
    issuer.id !== actor.organizationId &&
    !isSwitchableMcpSession(key.metadata)
  ) {
    return null;
  }
  return key;
}
