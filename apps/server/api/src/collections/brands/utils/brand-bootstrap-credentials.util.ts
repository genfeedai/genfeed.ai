import { fromPrismaCredentialPlatform } from '@genfeedai/contracts';
import { Prisma } from '@genfeedai/prisma';

/**
 * Credential columns the access bootstrap embeds on each brand. Every
 * brand-context consumer reads `selectedBrand.credentials`, so bootstrap
 * brands must carry them. The select is an allowlist: bootstrap rows are
 * plain JSON, not serializer output, so token, secret and OAuth columns
 * must never be reachable from it.
 */
const BOOTSTRAP_CREDENTIAL_SELECT = {
  accessTokenExpiry: true,
  brandId: true,
  createdAt: true,
  description: true,
  externalAvatar: true,
  externalHandle: true,
  externalId: true,
  externalName: true,
  id: true,
  isConnected: true,
  label: true,
  organizationId: true,
  platform: true,
  postingTimes: true,
  updatedAt: true,
  userId: true,
  warmupRiskLevel: true,
  warmupScore: true,
  warmupState: true,
} satisfies Prisma.CredentialSelect;

type BootstrapCredentialRow = Prisma.CredentialGetPayload<{
  select: typeof BOOTSTRAP_CREDENTIAL_SELECT;
}>;

/**
 * Prisma stores `platform` SCREAMING; brand-context consumers compare against
 * the lowercase domain enum, same as the credential serializer emits.
 */
function toBootstrapCredential(
  credential: BootstrapCredentialRow,
): Record<string, unknown> {
  return {
    ...credential,
    platform: fromPrismaCredentialPlatform(credential.platform),
  };
}

export function bootstrapCredentialInclude(organizationId: string) {
  return {
    orderBy: { createdAt: 'asc' as const },
    select: BOOTSTRAP_CREDENTIAL_SELECT,
    where: { isDeleted: false, organizationId },
  };
}

export function mapBootstrapCredentials(
  credentials: unknown,
): Record<string, unknown>[] {
  if (!Array.isArray(credentials)) {
    return [];
  }
  return credentials.flatMap((credential) => {
    if (!credential || typeof credential !== 'object') {
      return [];
    }
    return [toBootstrapCredential(credential as BootstrapCredentialRow)];
  });
}
