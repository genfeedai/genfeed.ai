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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new InviteMemberDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
