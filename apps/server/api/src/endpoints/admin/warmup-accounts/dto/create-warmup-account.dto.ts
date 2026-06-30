import {
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreateWarmupAccountDto {
  @IsEmail()
  @MaxLength(320)
  leadEmail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  leadFirstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  leadLastName?: string;

  @IsString()
  @MaxLength(120)
  organizationName!: string;

  @IsString()
  @MaxLength(120)
  brandName!: string;

  @IsOptional()
  @IsUrl({ require_protocol: false })
  @MaxLength(512)
  websiteUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  guidance?: string;
}
