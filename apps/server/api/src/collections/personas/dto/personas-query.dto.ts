import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { AvatarProvider, PersonaStatus } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export class PersonasQueryDto extends BaseQueryDto {
  @ApiProperty({
    description: 'Filter personas by status',
    enum: PersonaStatus,
    enumName: 'PersonaStatus',
    required: false,
  })
  @IsOptional()
  @IsEnum(PersonaStatus)
  status?: PersonaStatus;

  @ApiProperty({
    description: 'Filter personas by avatar provider',
    enum: AvatarProvider,
    enumName: 'AvatarProvider',
    required: false,
  })
  @IsOptional()
  @IsEnum(AvatarProvider)
  avatarProvider?: AvatarProvider;

  @ApiProperty({
    description: 'Filter personas by assigned member',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  assignedMember?: string;

  @ApiProperty({
    description:
      'Prefix match against handle and label for @-mention suggestions',
    required: false,
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiProperty({
    description:
      'When true, only active, non-archived personas with a handle are returned',
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    return value === true || value === 'true' || value === '1';
  })
  @IsBoolean()
  isMentionable?: boolean;
}
