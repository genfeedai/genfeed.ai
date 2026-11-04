import { toOptionalBoolean } from '@api/helpers/dto/optional-boolean.transform';
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class PublishPipelineQueryDto {
  @ApiProperty({
    default: false,
    description:
      'List posts reviewed in the window with any decision (rejected, request changes), not only approved ones',
    required: false,
  })
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  anyDecision?: boolean;

  @ApiProperty({
    default: 3,
    description: 'How many days back to include publish approvals created in',
    maximum: 30,
    minimum: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  days?: number;
}
