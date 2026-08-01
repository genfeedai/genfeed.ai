import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SubmitBrandInterviewAnswerDto {
  @ApiProperty({
    description:
      'The answer to the current interview question. For list fields, separate items with newlines or commas.',
    example: 'Professional yet warm, with a touch of wit.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  answer!: string;

  @ApiPropertyOptional({
    description:
      'Optional field key when re-saving an already-answered step from the steps sidebar. Defaults to the session current field.',
    example: 'tone',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  fieldKey?: string;
}
