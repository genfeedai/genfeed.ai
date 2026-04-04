import { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateImageDto extends PartialType(CreateImageDto) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the image is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Title of the image',
    required: false,
  })
  readonly title?: string;
}
