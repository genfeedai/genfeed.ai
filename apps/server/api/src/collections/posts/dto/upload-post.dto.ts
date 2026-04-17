import { CredentialPlatform } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UploadPostDto {
  @ApiProperty()
  @IsString()
  brandId!: string;

  @ApiProperty({ enum: CredentialPlatform, enumName: 'CredentialPlatform' })
  @IsEnum(CredentialPlatform)
  platform!: CredentialPlatform;

  @ApiProperty()
  @IsString()
  path!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  tags?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  caption?: string;
}
