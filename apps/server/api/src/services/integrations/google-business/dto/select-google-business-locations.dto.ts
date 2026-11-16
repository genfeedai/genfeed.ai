import { GOOGLE_BUSINESS_LOCATION_NAME_PATTERN } from '@api/services/integrations/google-business/google-business.constants';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  Matches,
} from 'class-validator';

/** Most locations one connect can add, so a large chain cannot hold a request open. */
const GOOGLE_BUSINESS_MAX_SELECTED_LOCATIONS = 25;

export class SelectGoogleBusinessLocationsDto {
  @ApiProperty({
    description:
      'Location ids from the locations list, as `accounts/{accountId}/locations/{locationId}`.',
    required: true,
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(GOOGLE_BUSINESS_MAX_SELECTED_LOCATIONS)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(GOOGLE_BUSINESS_LOCATION_NAME_PATTERN, { each: true })
  readonly locationIds!: string[];
}
