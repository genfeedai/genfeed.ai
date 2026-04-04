import { VoiceProvider } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  DEFAULT_VOICE_REF_SOURCES,
  type DefaultVoiceRefSource,
} from './default-voice-ref.constants';

export class DefaultVoiceRefDto {
  @IsEnum(DEFAULT_VOICE_REF_SOURCES)
  @ApiProperty({
    enum: DEFAULT_VOICE_REF_SOURCES,
  })
  readonly source!: DefaultVoiceRefSource;

  @IsEnum(VoiceProvider)
  @ApiProperty({
    enum: VoiceProvider,
  })
  readonly provider!: VoiceProvider;

  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'Internal cloned voice ingredient ID',
    required: false,
  })
  readonly internalVoiceId?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'External provider voice ID',
    required: false,
  })
  readonly externalVoiceId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  @ApiProperty({
    description: 'Display label for the saved voice',
    required: false,
  })
  readonly label?: string;

  @IsOptional()
  @IsUrl(
    {
      require_host: true,
      require_protocol: true,
    },
    { message: 'preview must be a valid URL' },
  )
  @ApiProperty({
    description: 'Preview audio URL for catalog voices',
    nullable: true,
    required: false,
  })
  readonly preview?: string | null;
}

export class NullableDefaultVoiceRefDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => DefaultVoiceRefDto)
  readonly defaultVoiceRef?: DefaultVoiceRefDto;
}
