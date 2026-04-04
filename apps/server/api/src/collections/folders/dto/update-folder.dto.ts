import { CreateFolderDto } from '@api/collections/folders/dto/create-folder.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateFolderDto extends PartialType(CreateFolderDto) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the folder is active',
    required: false,
  })
  readonly isActive?: boolean;
}
