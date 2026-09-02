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
  });
});
