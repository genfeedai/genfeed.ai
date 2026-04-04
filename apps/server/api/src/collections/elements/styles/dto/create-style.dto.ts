import { ElementDto } from '@api/shared/dto/element/element.dto';
import { ModelKey } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional } from 'class-validator';

export class CreateElementStyleDto extends ElementDto {
  @ApiProperty({
    description: 'Array of model keys this style applies to',
    enum: ModelKey,
    enumName: 'ModelKey',
    example: ['google/imagen-3', 'leonardoai'],
    isArray: true,
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(ModelKey, { each: true })
  models?: ModelKey[];
}
