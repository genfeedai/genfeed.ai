import { GOOGLE_BUSINESS_LOCATION_NAME_PATTERN } from '@api/services/integrations/google-business/google-business.constants';
import { GOOGLE_BUSINESS_MAX_SELECTED_LOCATIONS } from '@genfeedai/contracts/constants';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  Matches,
} from 'class-validator';

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
