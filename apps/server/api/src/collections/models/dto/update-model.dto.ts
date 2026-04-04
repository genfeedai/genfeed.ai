import { CreateModelDto } from '@api/collections/models/dto/create-model.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateModelDto extends PartialType(CreateModelDto) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the model is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;
}
