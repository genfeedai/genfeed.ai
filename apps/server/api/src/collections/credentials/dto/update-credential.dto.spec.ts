import { UpdateCredentialDto } from '@api/collections/credentials/dto/update-credential.dto';

describe('UpdateCredentialDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateCredentialDto();
      expect(dto).toBeInstanceOf(UpdateCredentialDto);
    });
  });
});
