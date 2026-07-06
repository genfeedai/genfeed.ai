import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/**
 * Body for `PATCH /tasks/:id/outputs/:outputId`. `isKept: true` marks the output
 * as an approved keeper; `false` reverts it.
 */
export class UpdateTaskOutputDto {
  @IsBoolean()
  @ApiProperty({
    description: 'Whether the output is kept (approved) or reverted.',
    type: Boolean,
  })
  isKept!: boolean;
}
