import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Studio quote line for the retry credit-back (#7730). The organization and
 * user come from the authenticated request, never from the body.
 */
export class PreviewRetryCreditBackDto {
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  @ApiProperty({
    description: 'Credits the quote for this generation shows.',
    example: 40,
  })
  readonly credits!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @ApiProperty({ description: 'The concrete model the quote priced.' })
  readonly modelKey!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20_000)
  @ApiProperty({ description: 'The prompt the user is about to generate.' })
  readonly prompt!: string;
}
