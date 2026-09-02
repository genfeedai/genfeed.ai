import { CreateActivityDto } from '@api/collections/activities/dto/create-activity.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional } from 'class-validator';

export class UpdateActivityDto extends PartialType(CreateActivityDto) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the activity has been read',
    required: false,
  })
  readonly isRead?: boolean;

  @IsObject()
  @IsOptional()
  @ApiProperty({
    description: 'Filter criteria for bulk operations',
    required: false,
  })
  readonly filter?: Record<string, unknown>;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the activity is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;
}
