import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class TrainingsQueryDto extends BaseQueryDto {
  @ApiProperty({
    description: 'Filter trainings by brand.',
    required: false,
    type: String,
  })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiProperty({
    description:
      'Filter trainings by status using repeated query keys (e.g., ?status=completed&status=failed).',
    enum: ['processing', 'completed', 'failed'],
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
