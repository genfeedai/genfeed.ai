import { ElementDto } from '@api/shared/dto/element/element.dto';
import { MODEL_KEYS } from '@genfeedai/constants';
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional } from 'class-validator';

export class CreateElementStyleDto extends ElementDto {
  @ApiProperty({
    description: 'Array of model keys this style applies to',
    enum: Object.values(MODEL_KEYS),
    enumName: 'ModelKey',
    example: ['google/imagen-3', 'leonardoai'],
    isArray: true,
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(Object.values(MODEL_KEYS), { each: true })
  models?: string[];
}
