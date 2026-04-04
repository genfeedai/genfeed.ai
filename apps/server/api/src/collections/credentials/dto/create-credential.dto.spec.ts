import { CreateCredentialDto } from '@api/collections/credentials/dto/create-credential.dto';

describe('CreateCredentialDto', () => {
  it('should be defined', () => {
    expect(CreateCredentialDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateCredentialDto();
      expect(dto).toBeInstanceOf(CreateCredentialDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateCredentialDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
