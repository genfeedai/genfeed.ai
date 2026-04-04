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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateMemberDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
