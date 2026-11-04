import { ContentPerformanceCountsDto } from '@api/collections/content-performance/dto/content-performance-counts.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { CredentialPlatform } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, ValidateIf } from 'class-validator';

export class ImportManualDto extends ContentPerformanceCountsDto {
  @ApiProperty({
    description: 'Post ID (provide this OR externalPostId)',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
