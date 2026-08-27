import { CreatePromptDto } from '@server/collections/prompts/dto/create-prompt.dto';
import { IsEntityId } from '@server/helpers/validation/entity-id.validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdatePromptDto extends PartialType(CreatePromptDto) {
  @IsEntityId()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly ingredientId?: string;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the prompt is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;
}
