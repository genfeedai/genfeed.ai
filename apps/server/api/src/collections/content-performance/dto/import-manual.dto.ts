import { CredentialPlatform } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

export class ImportManualDto {
  @ApiProperty({
    description: 'Post ID (provide this OR externalPostId)',
    required: false,
  })
  @IsOptional()
  @IsMongoId()
  postId?: string;

  @ApiProperty({
    description: 'External post ID (provide this OR postId)',
    required: false,
  })
  @ValidateIf((o: ImportManualDto) => !o.postId)
  @IsString()
  externalPostId?: string;

  @ApiProperty({
    description: 'Platform',
    enum: CredentialPlatform,
    required: true,
  })
  @IsEnum(CredentialPlatform)
  platform!: CredentialPlatform;

  @ApiProperty({ default: 0, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  views?: number;

  @ApiProperty({ default: 0, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  likes?: number;

  @ApiProperty({ default: 0, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  comments?: number;

  @ApiProperty({ default: 0, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  shares?: number;

  @ApiProperty({ default: 0, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  saves?: number;

  @ApiProperty({ default: 0, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  revenue?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
