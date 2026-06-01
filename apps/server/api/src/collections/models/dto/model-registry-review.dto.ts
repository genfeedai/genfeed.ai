import { UpdateModelDto } from '@api/collections/models/dto/update-model.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ModelRegistryReviewDto extends PartialType(UpdateModelDto) {
  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Reason recorded when rejecting a discovered model',
    required: false,
  })
  readonly reason?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Replacement model key or id when marking a model legacy',
    required: false,
  })
  readonly succeededBy?: string;
}
