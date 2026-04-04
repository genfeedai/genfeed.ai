import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateTaskCommentDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Markdown body of the comment',
    required: true,
  })
  readonly body!: string;
}
