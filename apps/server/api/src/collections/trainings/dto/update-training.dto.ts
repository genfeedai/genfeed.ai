import { CreateTrainingDto } from '@api/collections/trainings/dto/create-training.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateTrainingDto extends PartialType(CreateTrainingDto) {
  @IsOptional()
  @IsString()
  readonly externalId?: string;

  @IsOptional()
  @IsEntityId()
  @ApiProperty({
    description: 'Brand ID to associate with the training',
    required: false,
  })
  readonly brand?: string;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the training is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the training is active',
    required: false,
  })
  readonly isActive?: boolean;
}
