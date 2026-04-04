import { VoiceProvider } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsEnum, IsOptional } from 'class-validator';

export class ImportVoicesDto {
  @ApiProperty({
    description:
      'Providers to import into the catalog. Defaults to ElevenLabs and HeyGen.',
    enum: VoiceProvider,
    enumName: 'VoiceProvider',
    isArray: true,
    required: false,
  })
  @Transform(({ value }) => {
    if (!value) {
      return undefined;
    }

    const values = Array.isArray(value) ? value : [value];

    return values
      .flatMap((item) =>
        typeof item === 'string' ? item.split(',') : [String(item)],
      )
      .map((item) => item.trim())
      .filter(Boolean);
  })
  @IsOptional()
  @IsArray()
  @IsEnum(VoiceProvider, { each: true })
  providers?: VoiceProvider[];
}
