import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class VerifyMcpConnectionDto {
  @ApiProperty({
    description:
      'Copy-once Genfeed API key used only for this bounded MCP verification.',
    example: 'gf_live_...',
    writeOnly: true,
  })
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  @Matches(/^gf_(live|test)_[A-Za-z0-9_-]+$/)
  readonly key!: string;
}
