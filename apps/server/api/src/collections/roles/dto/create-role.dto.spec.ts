import { CreateRoleDto } from '@api/collections/roles/dto/create-role.dto';

describe('CreateRoleDto', () => {
  it('should be defined', () => {
    expect(CreateRoleDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateRoleDto();
      expect(dto).toBeInstanceOf(CreateRoleDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateRoleDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
