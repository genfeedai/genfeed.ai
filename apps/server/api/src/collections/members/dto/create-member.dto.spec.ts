import { CreateMemberDto } from '@api/collections/members/dto/create-member.dto';

describe('CreateMemberDto', () => {
  it('should be defined', () => {
    expect(CreateMemberDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateMemberDto();
      expect(dto).toBeInstanceOf(CreateMemberDto);
    });
  });
});
