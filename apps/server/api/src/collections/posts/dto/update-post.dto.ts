import { CreatePostDto } from '@api/collections/posts/dto/create-post.dto';
import { FORBID_NON_WHITELISTED } from '@api/helpers/pipes/validation.pipe';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsNumber, IsOptional } from 'class-validator';

export class UpdatePostDto extends PartialType(CreatePostDto) {
  static readonly [FORBID_NON_WHITELISTED] = true;
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the post is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'Retry count for failed posts',
    required: false,
  })
  readonly retryCount?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'Number of times the post has been repeated',
    required: false,
  })
  readonly repeatCount?: number;

  @IsDateString()
  @IsOptional()
  @ApiProperty({
    description: 'Last publish attempt timestamp - used for retry backoff',
    required: false,
  })
  readonly lastAttemptAt?: Date;
}
