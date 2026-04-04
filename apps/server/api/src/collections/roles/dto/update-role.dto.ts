import { CreateRoleDto } from '@api/collections/roles/dto/create-role.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateRoleDto extends PartialType(CreateRoleDto) {
  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    description: 'Whether the role is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;
}
