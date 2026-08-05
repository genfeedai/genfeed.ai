import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateMemberDto {
  @IsString()
  @IsOptional()
  @ApiProperty({
    description:
      'legacy auth provider organization membership ID used to synchronize state',
    nullable: true,
    required: false,
    type: String,
  })
  readonly authProviderMembershipId?: string | null;

  @IsEntityId()
  @ApiProperty({
    description: 'The organization ID this member belongs to',
    required: true,
  })
  readonly organizationId!: string;

  @IsEntityId()
  @ApiProperty({
    description: 'The user ID of this member',
    required: true,
  })
  readonly userId!: string;

  @IsEntityId()
  @ApiProperty({
    description: 'The role ID assigned to this member',
    required: true,
  })
  readonly roleId!: string;

  @IsOptional()
  @IsArray()
  @IsEntityId({ each: true })
  @ApiProperty({
    default: [],
    description: 'Array of brand IDs assigned to this member',
    required: false,
    type: [String],
  })
  readonly brandIds?: string[];

  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    default: true,
    description: 'Whether this member is currently active',
    required: false,
  })
  readonly isActive?: boolean;
}
