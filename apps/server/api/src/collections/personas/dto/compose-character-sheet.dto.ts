import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

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
}
