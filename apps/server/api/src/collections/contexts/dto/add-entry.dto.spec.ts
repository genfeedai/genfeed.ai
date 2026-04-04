import { AddEntryDto } from '@api/collections/contexts/dto/add-entry.dto';

describe('AddEntryDto', () => {
  it('should be defined', () => {
    expect(AddEntryDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new AddEntryDto();
      expect(dto).toBeInstanceOf(AddEntryDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new AddEntryDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
