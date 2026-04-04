import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';

export class CreditProvisionDto {
  @ApiProperty({
    description: 'Number of credits to provision',
    example: 500,
    minimum: 1,
  })
  @IsNumber()
  @IsPositive()
  @Min(1)
  amount!: number;

  @ApiProperty({
    description: 'Source of the credit provision (e.g., shopify, stripe)',
    example: 'shopify',
  })
  @IsString()
  @IsNotEmpty()
  source!: string;

  @ApiProperty({
    description: 'Plan ID that triggered this provision',
    example: 'starter',
  })
  @IsString()
  @IsNotEmpty()
  planId!: string;

  @ApiPropertyOptional({
    description: 'When these credits expire (ISO 8601 date string)',
    example: '2026-02-20T00:00:00.000Z',
  })
  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}
