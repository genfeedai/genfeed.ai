import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601 } from 'class-validator';

export class ApproveSystemBrandDto {
  @ApiProperty({ description: 'updatedAt of the reviewed draft' })
  @IsISO8601({ strict: true })
  updatedAt!: string;
}
