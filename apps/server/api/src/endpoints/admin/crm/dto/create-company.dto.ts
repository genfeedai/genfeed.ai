import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  @ApiProperty({ description: 'Company name' })
  readonly name!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Website URL', required: false })
  readonly website?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Domain', required: false })
  readonly domain?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Industry', required: false })
  readonly industry?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Company size', required: false })
  readonly size?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Notes', required: false })
  readonly notes?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Customer status', required: false })
  readonly status?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Billing type', required: false })
  readonly billingType?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Twitter handle', required: false })
  readonly twitterHandle?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Instagram handle', required: false })
  readonly instagramHandle?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Avatar URL', required: false })
  readonly avatarUrl?: string;
}
