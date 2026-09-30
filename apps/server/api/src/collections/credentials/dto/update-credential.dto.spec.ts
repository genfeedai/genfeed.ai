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
  });
});
