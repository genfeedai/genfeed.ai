import { MAX_MENTIONS_PER_ITEM } from '@api/collections/mentions/constants/mention-events.constants';
import { IsOmittable } from '@api/helpers/validation/is-omittable.validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateTaskCommentDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Markdown body of the comment',
    required: true,
  })
  readonly body!: string;

  @ApiPropertyOptional({
    description:
      'Canonical user ids of the teammates this comment mentions. Each must be an active member of the organization who reaches the task brand.',
    type: [String],
  })
  @IsOmittable()
  @IsArray()
  @ArrayMaxSize(MAX_MENTIONS_PER_ITEM)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  readonly mentionedUserIds?: string[];
}
