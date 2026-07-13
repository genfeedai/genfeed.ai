import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateAgentThreadContextDto {
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  brandId?: string | null;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedContextVersion!: number;
}
