import { CreateSettingDto } from '@api/collections/settings/dto/create-setting.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateSettingDto extends PartialType(CreateSettingDto) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the setting is marked as deleted',
    required: false,
  })
  readonly isDeleted!: boolean;
}
