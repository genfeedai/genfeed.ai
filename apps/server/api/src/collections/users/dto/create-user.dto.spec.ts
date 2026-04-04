import { CreateUserDto } from '@api/collections/users/dto/create-user.dto';

describe('CreateUserDto', () => {
  it('should be defined', () => {
    expect(CreateUserDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateUserDto();
      expect(dto).toBeInstanceOf(CreateUserDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateUserDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
