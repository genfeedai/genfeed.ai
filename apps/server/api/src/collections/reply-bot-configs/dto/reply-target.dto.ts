import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class DiscoverReplyTargetsDto {
  @IsEntityId()
  @ApiProperty({ description: 'Brand whose X account is being warmed up' })
  brandId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  @ApiProperty({
    description: 'The niche in a few words, e.g. "indie hackers shipping saas"',
    maxLength: 200,
    minLength: 3,
  })
  query!: string;

  @IsNumber()
  @Min(1)
  @Max(20)
  @IsOptional()
  @ApiProperty({ default: 10, maximum: 20, minimum: 1, required: false })
  maxResults?: number;
}

export class AddReplyTargetDto {
  @IsEntityId()
  @ApiProperty({ description: 'Brand whose X account is being warmed up' })
  brandId!: string;

  @IsString()
  @Matches(/^@?[A-Za-z0-9_]{1,15}$/)
  @ApiProperty({
    description: 'X username to monitor, with or without @',
    example: 'someaccount',
  })
  username!: string;
}

export class ReplyTargetsQueryDto {
  @IsEntityId()
  @ApiProperty({ description: 'Brand whose X account is being warmed up' })
  brandId!: string;
}
