import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SetActiveIngredientVersionDto {
  @ApiProperty({
    description: 'The asset of the version history to make active',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  readonly versionId!: string;
}
