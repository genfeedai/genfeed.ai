import { InviteMemberDto } from '@api/collections/members/dto/invite-member.dto';

describe('InviteMemberDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new InviteMemberDto();
      expect(dto).toBeInstanceOf(InviteMemberDto);
    });
  });
});
