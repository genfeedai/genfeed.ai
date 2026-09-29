import { AddEntryDto } from '@api/collections/contexts/dto/add-entry.dto';

describe('AddEntryDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new AddEntryDto();
      expect(dto).toBeInstanceOf(AddEntryDto);
    });
  });
});
