import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional } from 'class-validator';

export class UpdateMemberDto {
  @IsArray()
  @IsEntityId({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Brand IDs assigned to this member',
    required: false,
    type: [String],
  })
  readonly brandIds?: string[];

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether this member is currently active',
    required: false,
  })
  readonly isActive?: boolean;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({
    description: 'The role ID assigned to this member',
    required: false,
  })
  readonly roleId?: string;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the member is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;
}
