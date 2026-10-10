import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AcceptTurboProjectQuoteDto {
  @ApiPropertyOptional({
    description: 'Accepted quote; required to generate ideas',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  readonly quoteId?: string;
}
