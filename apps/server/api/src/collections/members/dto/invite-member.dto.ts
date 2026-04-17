import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsMongoId, IsOptional, IsString } from 'class-validator';

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
  @IsMongoId()
  @ApiProperty({ required: false })
  readonly role?: string;
}
