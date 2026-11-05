import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

const GENFEED_API_KEY_PATTERN = /^gf_(live|test)_[A-Za-z0-9_-]+$/;

export class VerifyMcpConnectionDto {
  @ApiProperty({
    description:
      'Copy-once Genfeed API key used only for this bounded MCP verification.',
    example: 'gf_live_...',
    maxLength: 256,
    minLength: 32,
    pattern: '^gf_(live|test)_[A-Za-z0-9_-]+$',
    writeOnly: true,
  })
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  @Matches(GENFEED_API_KEY_PATTERN)
  readonly key!: string;
}
