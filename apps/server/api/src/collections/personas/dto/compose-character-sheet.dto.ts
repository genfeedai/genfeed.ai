import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class ComposeCharacterSheetDto {
  @IsString()
  @MinLength(1)
  @ApiProperty({
    description: 'User description inserted as DATA in the sheet preset',
  })
  readonly description!: string;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    description: 'Include a side-profile view for non-humanoid identities',
    required: false,
  })
  readonly isNonHumanoid?: boolean;

  @IsOptional()
  @IsIn(['neutral', 'outdoor'])
  @ApiProperty({
    description:
      'Where the sheet is shot: a neutral studio, or an empty outdoor place for realistic light',
    enum: ['neutral', 'outdoor'],
    required: false,
  })
  readonly environment?: 'neutral' | 'outdoor';
}
