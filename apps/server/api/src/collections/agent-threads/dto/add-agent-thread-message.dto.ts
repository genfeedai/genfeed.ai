import { MAX_MENTIONS_PER_ITEM } from '@api/collections/mentions/constants/mention-events.constants';
import { IsOmittable } from '@api/helpers/validation/is-omittable.validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsString,
  MinLength,
} from 'class-validator';

export class AddAgentThreadMessageDto {
  @ApiProperty({ description: 'The message text.' })
  @IsString()
  readonly content!: string;

  @ApiPropertyOptional({
    description: 'Only the thread owner may set a role; others write as user.',
  })
  @IsOmittable()
  @IsString()
  readonly role?: string;

  @ApiPropertyOptional({
    description:
      'Canonical user ids of the teammates this message mentions. Each must be an active member of the organization who reaches the thread brand.',
    type: [String],
  })
  @IsOmittable()
  @IsArray()
  @ArrayMaxSize(MAX_MENTIONS_PER_ITEM)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  readonly mentionedUserIds?: string[];

  @ApiPropertyOptional({
    description:
      'Share the thread at "view" with mentioned teammates who cannot open it yet. Needs the owner or an admin; without it such a mention is refused.',
  })
  @IsOmittable()
  @IsBoolean()
  readonly shareMentioned?: boolean;
}
