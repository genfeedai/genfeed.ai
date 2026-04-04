import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SetThumbnailDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Media URL to persist as the workflow thumbnail',
  })
  readonly thumbnailUrl!: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Node ID whose output is used as the workflow thumbnail',
  })
  readonly nodeId!: string;
}
