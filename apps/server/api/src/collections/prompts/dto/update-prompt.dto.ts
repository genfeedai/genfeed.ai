import { CreatePromptDto } from '@api/collections/prompts/dto/create-prompt.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsMongoId, IsOptional } from 'class-validator';
import { Types } from 'mongoose';

export class UpdatePromptDto extends PartialType(CreatePromptDto) {
  @IsMongoId()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly ingredient?: Types.ObjectId;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the prompt is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;
}
