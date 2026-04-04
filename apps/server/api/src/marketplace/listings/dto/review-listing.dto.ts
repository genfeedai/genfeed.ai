import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewListingDto {
  @ApiProperty({
    description: 'Optional moderator note or rejection reason',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  readonly reason?: string;
}
