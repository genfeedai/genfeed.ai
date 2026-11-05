import type { IMember, IRole } from '@genfeedai/contracts/interfaces';
import {
  createBaseEntity,
  createOrganization,
  createUser,
} from '@genfeedai/helpers/testing/entity-fixtures';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  Member: class BaseMember {
    public organization?: unknown;
    public user?: {
      firstName?: string;
      lastName?: string;
      email?: string;
      fullName?: string;
    };
    public role?: { label?: string };
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/auth/role.model', () => ({
  Role: class Role {
    public label?: string;
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/auth/user.model', () => ({
  User: class User {
    public firstName?: string;
    public lastName?: string;
    public email?: string;
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
    get fullName(): string {
      const name = `${this.firstName ?? ''} ${this.lastName ?? ''}`.trim();
      return name || '-';
    }
  },
}));

vi.mock('@models/organization/organization.model', () => ({
  Organization: class Organization {
    public id?: string;
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { Member } from '@models/organization/member.model';

const createRole = (partial: Partial<IRole> = {}): IRole => ({
  ...createBaseEntity<IRole>(partial),
  key: 'admin',
  label: 'Admin',
  ...partial,
});

const createMember = (partial: Partial<IMember> = {}) =>
  new Member({
    ...createBaseEntity<IMember>(partial),
    isActive: true,
    organization: createOrganization(),
    organizationId: 'organization-1',
    role: createRole(),
    roleId: 'role-1',
    user: createUser(),
    userId: 'user-1',
    ...partial,
  });

describe('Member', () => {
  describe('constructor', () => {
    it('should create a member instance', () => {
      const member = createMember({ id: 'mem-1' });
      expect(member).toBeDefined();
    });

    it('should instantiate populated organization', () => {
      const member = createMember({
        organization: createOrganization({ id: 'org-1' }),
      });
      expect(member.organization).toBeDefined();
    });

    it('should instantiate populated user', () => {
      const member = createMember({
        user: createUser({
          email: 'test@example.com',
          firstName: 'John',
          id: 'user-1',
        }),
      });
      expect(member.user).toBeDefined();
    });

    it('should instantiate populated role', () => {
      const member = createMember({
        role: createRole({ id: 'role-1', label: 'Admin' }),
      });
      expect(member.role).toBeDefined();
    });

    it('keeps the canonical organization ID independently of population', () => {
      const member = createMember({ organizationId: 'org-string' });
      expect(member.organizationId).toBe('org-string');
    });
  });

  describe('userFullName', () => {
    it('should return full name from User instance', () => {
      const member = createMember({
        user: createUser({ firstName: 'Jane', id: 'u1', lastName: 'Doe' }),
      });
      expect(member.userFullName).toBe('Jane Doe');
    });

    it('should return "-" when user has no name', () => {
      const member = createMember({
        user: createUser({ firstName: '', id: 'u2', lastName: '' }),
      });
      expect(member.userFullName).toBe('-');
    });

    it('should return first name only when last name is missing', () => {
      const member = createMember({
        user: createUser({ firstName: 'Alice', id: 'u3', lastName: '' }),
      });
      expect(member.userFullName).toBe('Alice');
    });

    it('should handle user as non-User instance', () => {
      const member = createMember({ user: undefined as never });
      expect(member.userFullName).toBe('-');
    });
  });

  describe('userEmail', () => {
    it('should return user email', () => {
      const member = createMember({
        user: createUser({ email: 'test@example.com', id: 'u1' }),
      });
      expect(member.userEmail).toBe('test@example.com');
    });

    it('should return undefined when user is missing', () => {
      const member = createMember({ user: undefined as never });
      expect(member.userEmail).toBeUndefined();
    });
  });

  describe('roleLabel', () => {
    it('should return role label', () => {
      const member = createMember({
        role: createRole({ id: 'r1', key: 'editor', label: 'Editor' }),
      });
      expect(member.roleLabel).toBe('Editor');
    });

    it('should return undefined when role is missing', () => {
      const member = createMember({ role: undefined as never });
      expect(member.roleLabel).toBeUndefined();
    });
  });
});
