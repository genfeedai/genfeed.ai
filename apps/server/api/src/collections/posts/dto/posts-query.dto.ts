import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { CredentialPlatform, PostStatus } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsMongoId, IsOptional } from 'class-validator';
import { Types } from 'mongoose';

export class PostsQueryDto extends BaseQueryDto {
  @ApiProperty({
    description: 'Filter posts scheduled after this date (ISO 8601 format)',
    example: '2024-01-01T00:00:00.000Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({
    description: 'Filter posts scheduled before this date (ISO 8601 format)',
    example: '2024-01-31T23:59:59.999Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({
    description: 'Filter posts by platform',
    enum: CredentialPlatform,
    enumName: 'CredentialPlatform',
    example: CredentialPlatform.YOUTUBE,
    required: false,
  })
  @IsOptional()
  @IsEnum(CredentialPlatform)
  platform?: CredentialPlatform;

  @ApiProperty({
    description: 'Filter posts by status',
    enum: PostStatus,
    enumName: 'PostStatus',
    example: PostStatus.PUBLIC,
    required: false,
  })
  @IsOptional()
  @IsEnum(PostStatus)
  status?: PostStatus;

  @ApiProperty({
    description: 'Filter posts by credential ID',
    required: false,
  })
  @IsOptional()
  @IsMongoId()
  credential?: Types.ObjectId;
}
