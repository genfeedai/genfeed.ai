import { UpdateMemberDto } from '@api/collections/members/dto/update-member.dto';

describe('UpdateMemberDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateMemberDto();
      expect(dto).toBeInstanceOf(UpdateMemberDto);
    });
  });
});
