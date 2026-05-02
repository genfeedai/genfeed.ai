import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { AvatarProvider, PersonaStatus } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

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
}
