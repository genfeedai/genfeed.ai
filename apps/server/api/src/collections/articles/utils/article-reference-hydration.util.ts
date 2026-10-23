import type { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import type { UsersService } from '@api/collections/users/services/users.service';

export type ArticleReferenceHydrationPorts = {
  usersService?: Pick<UsersService, 'findAll'>;
  organizationsService?: Pick<OrganizationsService, 'findAll'>;
};

/**
 * Hydrate user and organization fields via application-level join.
 * These refs live in the auth DB and cannot be populated cross-database.
 */
export async function hydrateArticleReferences(
  docs: Array<Record<string, unknown>>,
  ports: ArticleReferenceHydrationPorts,
): Promise<void> {
  if (docs.length === 0) {
    return;
  }

  const userIds = [
    ...new Set(docs.map((d) => d.userId?.toString()).filter(Boolean)),
  ] as string[];
  const orgIds = [
    ...new Set(docs.map((d) => d.organizationId?.toString()).filter(Boolean)),
  ] as string[];

  // Scope by id. Never load the full users/orgs tables — that is both an
  // availability hazard (full-table findMany) and a schema-drift amplifier:
  // production dropped `users.authProviderId` while older clients still
  // projected every user row (Sentry API-GENFEED-AI-65 / #2185).
  const [users, orgs] = await Promise.all([
    ports.usersService && userIds.length > 0
      ? ports.usersService
          .findAll(
            {
              where: {
                id: { in: userIds },
                isDeleted: false,
              },
            },
            { pagination: false },
          )
          .then((result) => result.docs as Array<Record<string, unknown>>)
      : Promise.resolve([] as Array<Record<string, unknown>>),
    ports.organizationsService && orgIds.length > 0
      ? ports.organizationsService
          .findAll(
            {
              where: {
                id: { in: orgIds },
                isDeleted: false,
              },
            },
            { pagination: false },
          )
          .then((result) => result.docs as Array<Record<string, unknown>>)
      : Promise.resolve([] as Array<Record<string, unknown>>),
  ]);

  const usersMap = new Map(
    users.map((u: Record<string, unknown>) => [String(u.id), u]),
  );
  const orgsMap = new Map(
    orgs.map((o: Record<string, unknown>) => [String(o.id), o]),
  );

  for (const doc of docs) {
    const docUserId = doc.userId?.toString();
    const docOrgId = doc.organizationId?.toString();
    if (docUserId && usersMap.has(docUserId)) {
      doc.user = usersMap.get(docUserId);
    }
    if (docOrgId && orgsMap.has(docOrgId)) {
      doc.organization = orgsMap.get(docOrgId);
    }
  }
}
