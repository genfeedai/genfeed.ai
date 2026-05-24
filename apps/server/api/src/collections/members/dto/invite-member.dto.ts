import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class InviteMemberDto {
  @IsEmail()
  @ApiProperty({ required: true })
  readonly email!: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  readonly firstName?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  readonly lastName?: string;

  @IsOptional()
  @IsEntityId()
  @ApiProperty({ required: false })
  readonly role?: string;
}
