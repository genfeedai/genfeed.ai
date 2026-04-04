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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UpdateMemberDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
