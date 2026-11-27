import { describe, expect, it } from 'vitest';
import { filterToolsByRole, hasRequiredRole } from './roles';

describe('roles', () => {
  it.each([
    ['user', 'user', true],
    ['user', 'admin', false],
    ['user', 'superadmin', false],
    ['admin', 'user', true],
    ['admin', 'admin', true],
    ['admin', 'superadmin', false],
    ['superadmin', 'admin', true],
    ['superadmin', 'superadmin', true],
  ] as const)('%s meets %s: %s', (role, required, expected) => {
    expect(hasRequiredRole(role, required)).toBe(expected);
  });

  it('admits everyone when a tool names no role', () => {
    expect(hasRequiredRole('user', undefined)).toBe(true);
  });

  it('lists only the tools a role may call', () => {
    const tools = [
      { name: 'open' },
      { name: 'member', requiredRole: 'user' as const },
      { name: 'staff', requiredRole: 'admin' as const },
      { name: 'root', requiredRole: 'superadmin' as const },
    ];
    expect(filterToolsByRole(tools, 'user').map((tool) => tool.name)).toEqual([
      'open',
      'member',
    ]);
    expect(filterToolsByRole(tools, 'admin').map((tool) => tool.name)).toEqual([
      'open',
      'member',
      'staff',
    ]);
    expect(filterToolsByRole(tools, 'superadmin')).toHaveLength(4);
  });
});
