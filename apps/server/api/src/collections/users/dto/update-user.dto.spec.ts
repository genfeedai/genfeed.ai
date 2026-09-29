import { UpdateUserDto } from '@api/collections/users/dto/update-user.dto';

describe('UpdateUserDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateUserDto();
      expect(dto).toBeInstanceOf(UpdateUserDto);
    });
  });
});
