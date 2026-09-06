import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
export class ExportIngredientDto {
  @IsBoolean()
  @ApiProperty()
  readonly watermark!: boolean;
}
