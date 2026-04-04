import { UpdateUserDto } from '@api/collections/users/dto/update-user.dto';

describe('UpdateUserDto', () => {
  it('should be defined', () => {
    expect(UpdateUserDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateUserDto();
      expect(dto).toBeInstanceOf(UpdateUserDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UpdateUserDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
