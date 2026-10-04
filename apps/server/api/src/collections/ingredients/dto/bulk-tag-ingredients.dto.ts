import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { TagBulkAction } from '@genfeedai/contracts';
import { LIBRARY_BULK_TAG_LIMIT } from '@genfeedai/contracts/constants';
import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum } from 'class-validator';

export class BulkTagIngredientsDto {
  @ApiProperty({
    description: `Assets to change, at most ${LIBRARY_BULK_TAG_LIMIT} per request`,
    maxItems: LIBRARY_BULK_TAG_LIMIT,
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(LIBRARY_BULK_TAG_LIMIT, {
    message: `A bulk tag request can change at most ${LIBRARY_BULK_TAG_LIMIT} assets`,
  })
  @IsEntityId({ each: true })
  readonly ids!: string[];

  @ApiProperty({ description: 'The tag to add or remove' })
  @IsEntityId()
  readonly tagId!: string;

  @ApiProperty({ enum: TagBulkAction, enumName: 'TagBulkAction' })
  @IsEnum(TagBulkAction)
  readonly action!: TagBulkAction;
}
