import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

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
}
