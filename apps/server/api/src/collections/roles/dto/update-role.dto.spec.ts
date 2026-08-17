import { UpdateRoleDto } from '@api/collections/roles/dto/update-role.dto';

describe('UpdateRoleDto', () => {
  it('should be defined', () => {
    expect(UpdateRoleDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateRoleDto();
      expect(dto).toBeInstanceOf(UpdateRoleDto);
    });
  });
});
