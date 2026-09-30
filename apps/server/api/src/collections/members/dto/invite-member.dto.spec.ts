import { InviteMemberDto } from '@api/collections/members/dto/invite-member.dto';

describe('InviteMemberDto', () => {
  it('should be defined', () => {
    expect(InviteMemberDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new InviteMemberDto();
      expect(dto).toBeInstanceOf(InviteMemberDto);
    });
  });
});
