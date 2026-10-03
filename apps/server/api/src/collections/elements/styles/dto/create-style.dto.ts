import { PlatformElementDto } from '@api/shared/dto/element/platform-element.dto';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional } from 'class-validator';

export class CreateElementStyleDto extends PlatformElementDto {
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
