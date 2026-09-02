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
  });
});
