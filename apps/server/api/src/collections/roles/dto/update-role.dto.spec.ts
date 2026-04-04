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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UpdateRoleDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
