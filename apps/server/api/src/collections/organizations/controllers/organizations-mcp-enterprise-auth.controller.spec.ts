import 'reflect-metadata';

import { describe, expect, it } from 'vitest';
import { OrganizationsMcpEnterpriseAuthController } from './organizations-mcp-enterprise-auth.controller';

describe('OrganizationsMcpEnterpriseAuthController', () => {
  it.each(['get', 'save', 'remove'] as const)(
    'limits %s to organization owners and platform superadmins',
    (handler) => {
      const roles = Reflect.getMetadata(
        'roles',
        OrganizationsMcpEnterpriseAuthController.prototype[handler],
      );

      expect(roles).toEqual(['superadmin', 'owner']);
    },
  );
});
