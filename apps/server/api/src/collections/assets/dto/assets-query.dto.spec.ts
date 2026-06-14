import { AssetQueryDto } from '@api/collections/assets/dto/assets-query.dto';
import { plainToInstance } from 'class-transformer';

describe('AssetQueryDto', () => {
  it('should be defined', () => {
    expect(AssetQueryDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new AssetQueryDto();
      expect(dto).toBeInstanceOf(AssetQueryDto);
    });
  });

  describe('lightweight transform', () => {
    it.each([
      [undefined, false],
      [null, false],
      ['true', true],
      [true, true],
      ['false', false],
      [false, false],
      ['0', false],
      [0, false],
      ['', false],
    ])('maps %p → %p', (input, expected) => {
      const dto = plainToInstance(AssetQueryDto, { lightweight: input });
      expect(dto.lightweight).toBe(expected);
    });
  });
});
