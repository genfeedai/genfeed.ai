import { CreateTrackedLinkDto } from '@api/collections/tracked-links/dto/create-tracked-link.dto';

describe('CreateTrackedLinkDto', () => {
  it('should be defined', () => {
    expect(CreateTrackedLinkDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateTrackedLinkDto();
      expect(dto).toBeInstanceOf(CreateTrackedLinkDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateTrackedLinkDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
