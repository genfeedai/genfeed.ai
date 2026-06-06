import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class TrainingsQueryDto extends BaseQueryDto {
  @ApiProperty({
    description:
      'Filter trainings by status using repeated query keys (e.g., ?status=completed&status=failed). ' +
      'Values are mapped to the TrainingStage enum: ' +
      'pending→PENDING, uploading→UPLOADING, processing→TRAINING, training→TRAINING, ' +
      'completed→READY, ready→READY, failed→FAILED, cancelled→CANCELLED. ' +
      'Unknown values are silently dropped.',
    enum: [
      'pending',
      'uploading',
      'processing',
      'training',
      'completed',
      'ready',
      'failed',
      'cancelled',
    ],
    required: false,
    type: [String],
  })
  @Transform(({ value }) => {
    if (!value) {
      return undefined;
    }
    if (Array.isArray(value)) {
      return value;
    }
    return [value];
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  status?: string[];
}
