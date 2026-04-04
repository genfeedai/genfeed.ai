import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateTaskCommentDto {
  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Updated body of the comment',
    required: false,
  })
  readonly body?: string;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the comment is deleted',
    required: false,
  })
  readonly isDeleted?: boolean;
}
