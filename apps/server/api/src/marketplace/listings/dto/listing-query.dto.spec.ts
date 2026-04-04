import { ListingQueryDto } from '@api/marketplace/listings/dto/listing-query.dto';
import { plainToInstance } from 'class-transformer';

describe('ListingQueryDto', () => {
  it('should be defined', () => {
    expect(ListingQueryDto).toBeDefined();
  });

  it('normalizes repeated tags query keys into an array', () => {
    const dto = plainToInstance(ListingQueryDto, {
      tags: ['video', 'template'],
    });

    expect(dto.tags).toEqual(['video', 'template']);
  });

  it('normalizes a singleton tags query into a single-item array', () => {
    const dto = plainToInstance(ListingQueryDto, {
      tags: 'video',
    });

    expect(dto.tags).toEqual(['video']);
  });
});
