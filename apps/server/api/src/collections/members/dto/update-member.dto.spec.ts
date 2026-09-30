import { UpdateMemberDto } from '@api/collections/members/dto/update-member.dto';

describe('UpdateMemberDto', () => {
  it('should be defined', () => {
    expect(UpdateMemberDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateMemberDto();
      expect(dto).toBeInstanceOf(UpdateMemberDto);
    });
  });
});
