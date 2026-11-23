import { FACEBOOK_MAX_SELECTED_PAGES } from '@genfeedai/contracts/constants';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  Matches,
} from 'class-validator';

/** Page ids are numeric strings. */
const FACEBOOK_PAGE_ID_PATTERN = /^\d{1,32}$/;

export class SelectFacebookPagesDto {
  @ApiProperty({
    description: 'Page ids from the pages list of this connection.',
    required: true,
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(FACEBOOK_MAX_SELECTED_PAGES)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(FACEBOOK_PAGE_ID_PATTERN, { each: true })
  readonly pageIds!: string[];
}
