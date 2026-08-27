import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

export class UpsertDashboardLayoutDto {
  @ApiProperty({ description: 'Brand ID this dashboard layout belongs to' })
  @IsString()
  readonly brandId!: string;

  @ApiProperty({
    description:
      'Page key identifying which dashboard page this layout is for. Defaults to `workspace-overview` when omitted.',
    required: false,
  })
  @IsString()
  @IsOptional()
  readonly pageKey?: string;

  @ApiProperty({
    description:
      'Persisted dashboard layout document (sanitized OpenUI blocks)',
  })
  @IsObject()
  readonly document!: Record<string, unknown>;

  @ApiProperty({ description: 'Layout schema version', required: false })
  @IsNumber()
  @IsOptional()
  readonly version?: number;
}
