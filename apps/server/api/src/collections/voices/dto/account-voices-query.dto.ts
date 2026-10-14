import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AccountVoicesQueryDto {
  @ApiProperty({
    description: 'Search the connected account voices by name or label',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  readonly search?: string;

  @ApiProperty({
    description: 'Next-page token returned by the previous page',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  readonly pageToken?: string;
}
