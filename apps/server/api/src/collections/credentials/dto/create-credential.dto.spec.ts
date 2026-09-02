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
  });
});
