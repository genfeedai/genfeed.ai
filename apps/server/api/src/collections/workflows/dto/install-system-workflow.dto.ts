import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class InstallSystemWorkflowDto {
  @ApiPropertyOptional({
    description:
      'Optional brand to bind the installed workflow to. Defaults to the active brand when present.',
  })
  @IsOptional()
  @IsString()
  brandId?: string;
}
