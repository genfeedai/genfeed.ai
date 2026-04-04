import { CreateOrganizationSettingDto } from '@api/collections/organization-settings/dto/create-organization-setting.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateOrganizationSettingDto extends PartialType(
  CreateOrganizationSettingDto,
) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the style is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;
}
