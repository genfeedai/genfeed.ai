import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const MAX_REVIEW_REQUEST_REVIEWERS = 10;

/** Asks teammates to review one Library asset (#9945). */
export class CreateTaskReviewRequestDto {
  @ApiProperty({
    description:
      'Members to ask. One review task, with its own thread, is created for each.',
    maxItems: MAX_REVIEW_REQUEST_REVIEWERS,
    minItems: 1,
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_REVIEW_REQUEST_REVIEWERS)
  @ArrayUnique()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  readonly reviewerUserIds!: string[];

  @ApiPropertyOptional({
    description: 'What the reviewer should look at. Shown on the task.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  readonly note?: string;
}
