import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSkillCheckoutDto {
  @IsString()
  @IsOptional()
  @MaxLength(120)
  @ApiProperty({
    description: 'Pre-fill email for checkout',
    required: false,
  })
  readonly email?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2048)
  @ApiProperty({
    description: 'URL to redirect to after successful checkout',
    required: false,
  })
  readonly successUrl?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2048)
  @ApiProperty({
    description: 'URL to redirect to if checkout is cancelled',
    required: false,
  })
  readonly cancelUrl?: string;
}
