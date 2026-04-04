import {
  AvatarProvider,
  PersonaContentFormat,
  PersonaStatus,
  VoiceProvider,
} from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Types } from 'mongoose';

export class ContentStrategyDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({
    description: 'Content topics/themes',
    required: false,
    type: [String],
  })
  readonly topics?: string[];

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Brand voice tone descriptor',
    required: false,
  })
  readonly tone?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(PersonaContentFormat, { each: true })
  @ApiProperty({
    description: 'Preferred content formats',
    enum: PersonaContentFormat,
    enumName: 'PersonaContentFormat',
    isArray: true,
    required: false,
  })
  readonly formats?: PersonaContentFormat[];

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Posting cadence (e.g., daily, weekly)',
    required: false,
  })
  readonly frequency?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({
    description: 'Priority platform ordering',
    required: false,
    type: [String],
  })
  readonly platforms?: string[];
}

export class CreatePersonaDto {
  @IsString()
  @ApiProperty({
    description: 'Display name of the persona',
    required: true,
  })
  readonly label!: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Social handle',
    required: false,
  })
  readonly handle?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Bio/description',
    required: false,
  })
  readonly bio?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'CDN URL for profile image',
    required: false,
  })
  readonly profileImageUrl?: string;

  @IsOptional()
  @IsMongoId()
  @ApiProperty({
    description: 'Avatar ingredient ID',
    required: false,
  })
  readonly avatar?: Types.ObjectId;

  @IsOptional()
  @IsEnum(AvatarProvider)
  @ApiProperty({
    description: 'Avatar provider',
    enum: AvatarProvider,
    enumName: 'AvatarProvider',
    required: false,
  })
  readonly avatarProvider?: AvatarProvider;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Provider-side avatar ID',
    required: false,
  })
  readonly avatarExternalId?: string;

  @IsOptional()
  @IsMongoId()
  @ApiProperty({
    description: 'Voice ID',
    required: false,
  })
  readonly voice?: Types.ObjectId;

  @IsOptional()
  @IsEnum(VoiceProvider)
  @ApiProperty({
    description: 'Voice provider',
    enum: VoiceProvider,
    enumName: 'VoiceProvider',
    required: false,
  })
  readonly voiceProvider?: VoiceProvider;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Provider-side voice ID',
    required: false,
  })
  readonly voiceExternalId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ContentStrategyDto)
  @ApiProperty({
    description: 'Content strategy configuration',
    required: false,
    type: ContentStrategyDto,
  })
  readonly contentStrategy?: ContentStrategyDto;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  @ApiProperty({
    description: 'Linked credential IDs for social accounts',
    required: false,
    type: [String],
  })
  readonly credentials?: Types.ObjectId[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  @ApiProperty({
    description: 'Assigned team member user IDs',
    required: false,
    type: [String],
  })
  readonly assignedMembers?: Types.ObjectId[];

  @IsOptional()
  @IsEnum(PersonaStatus)
  @ApiProperty({
    default: PersonaStatus.DRAFT,
    description: 'Persona status',
    enum: PersonaStatus,
    enumName: 'PersonaStatus',
    required: false,
  })
  readonly status?: PersonaStatus;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  @ApiProperty({
    description: 'Tag IDs',
    required: false,
    type: [String],
  })
  readonly tags?: Types.ObjectId[];
}
