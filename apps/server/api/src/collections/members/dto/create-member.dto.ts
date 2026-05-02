import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional } from 'class-validator';

export class CreateMemberDto {
  @IsEntityId()
  @ApiProperty({
    description: 'The organization ID this member belongs to',
    required: true,
  })
  readonly organization!: string;

  @IsEntityId()
  @ApiProperty({
    description: 'The user ID of this member',
    required: true,
  })
  readonly user!: string;

  @IsEntityId()
  @ApiProperty({
    description: 'The role ID assigned to this member',
    required: true,
  })
  readonly role!: string;

  @IsOptional()
  @IsArray()
  @IsEntityId({ each: true })
  @ApiProperty({
    default: [],
    description: 'Array of brand IDs assigned to this member',
    required: false,
    type: [String],
  })
  readonly brands?: string[];

  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    default: true,
    description: 'Whether this member is currently active',
    required: false,
  })
  readonly isActive?: boolean;
}
