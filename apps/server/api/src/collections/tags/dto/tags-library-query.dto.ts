import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Query for the Library tag picker (`GET /tags/library`): the tags one brand
 * can use, with how many of that brand's assets carry each.
 */
export class TagsLibraryQueryDto {
  @ApiProperty({
    description:
      'Brand whose tags to list. Defaults to the active brand; members may ' +
      'only ask for their own active brand.',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  readonly brandId?: string;

  @ApiProperty({
    description: 'Case-insensitive label search',
    required: false,
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(80)
  readonly search?: string;
}
