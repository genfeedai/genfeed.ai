import { CreateTrainingDto } from '@api/collections/trainings/dto/create-training.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsMongoId, IsOptional, IsString } from 'class-validator';
import { Types } from 'mongoose';

export class UpdateTrainingDto extends PartialType(CreateTrainingDto) {
  @IsOptional()
  @IsString()
  readonly externalId?: string;

  @IsOptional()
  @IsMongoId()
  @ApiProperty({
    description: 'Brand ID to associate with the training',
    required: false,
  })
  readonly brand?: Types.ObjectId;

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
