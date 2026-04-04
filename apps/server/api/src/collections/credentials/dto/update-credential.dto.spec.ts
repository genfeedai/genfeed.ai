import { UpdateCredentialDto } from '@api/collections/credentials/dto/update-credential.dto';

describe('UpdateCredentialDto', () => {
  it('should be defined', () => {
    expect(UpdateCredentialDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateCredentialDto();
      expect(dto).toBeInstanceOf(UpdateCredentialDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UpdateCredentialDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
