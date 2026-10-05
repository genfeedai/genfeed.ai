import type { RoleDocument } from '@api/collections/roles/schemas/role.schema';
import type { RolesService } from '@api/collections/roles/services/roles.service';
import { MemberRole } from '@genfeedai/contracts';

export async function resolveOrganizationCreatorRole(
  rolesService: Pick<RolesService, 'findOne' | 'create'>,
): Promise<Pick<RoleDocument, 'id' | 'key'>> {
  for (const key of [MemberRole.OWNER, MemberRole.ADMIN]) {
    const role = await rolesService.findOne({ key });
    if (role?.id) return { id: String(role.id), key: role.key };
  }
  const role = await rolesService.create({
    key: MemberRole.OWNER,
    label: 'Owner',
  });
  return { id: String(role.id), key: role.key };
}
