import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsMongoId, IsOptional } from 'class-validator';

export class CreateMemberDto {
  @IsMongoId()
  @ApiProperty({
    description: 'The organization ID this member belongs to',
    required: true,
  })
  readonly organization!: string;

  @IsMongoId()
  @ApiProperty({
    description: 'The user ID of this member',
    required: true,
  })
  readonly user!: string;

  @IsMongoId()
  @ApiProperty({
    description: 'The role ID assigned to this member',
    required: true,
  })
  readonly role!: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
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
