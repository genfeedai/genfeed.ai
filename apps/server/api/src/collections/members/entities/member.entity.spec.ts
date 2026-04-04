import { MemberEntity } from '@api/collections/members/entities/member.entity';
import { Types } from 'mongoose';

describe('MemberEntity', () => {
  it('should be defined with role', () => {
    const roleId = new Types.ObjectId();
    const orgId = new Types.ObjectId();
    const userId = new Types.ObjectId();
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
