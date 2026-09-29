import { CreateUserDto } from '@api/collections/users/dto/create-user.dto';

describe('CreateUserDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateUserDto();
      expect(dto).toBeInstanceOf(CreateUserDto);
    });
  });
});
