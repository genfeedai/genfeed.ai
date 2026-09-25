import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAgentThreadDto {
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  readonly brandId?: string | null;

  @ApiPropertyOptional({
    description:
      'Runtime that executes this thread (e.g. `local/claude-cli` for turns run on the desktop user’s own CLI subscription).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  readonly runtimeKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  readonly source?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  readonly title?: string;
}
