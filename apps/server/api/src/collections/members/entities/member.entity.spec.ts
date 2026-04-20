import { MemberEntity } from '@api/collections/members/entities/member.entity';

describe('MemberEntity', () => {
  it('should be defined with role', () => {
    const roleId = '507f191e810c19729de860ee';
    const orgId = '507f191e810c19729de860ee';
    const userId = '507f191e810c19729de860ee';
    const entity = new MemberEntity({
      organization: orgId,
      role: roleId,
      user: userId,
    });
    expect(entity).toBeDefined();
    expect(entity).toBeInstanceOf(MemberEntity);
    // Verify Object.assign copies values (index signature access bypasses field declarations)
    expect(entity['role']).toEqual(roleId);
    expect(entity['organization']).toEqual(orgId);
    expect(entity['user']).toEqual(userId);
  });
});
