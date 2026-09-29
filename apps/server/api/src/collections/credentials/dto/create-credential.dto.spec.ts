import { CreateCredentialDto } from '@api/collections/credentials/dto/create-credential.dto';

describe('CreateCredentialDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateCredentialDto();
      expect(dto).toBeInstanceOf(CreateCredentialDto);
    });
  });
});
