import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateCostRecordDto {
  @IsString()
  @ApiProperty({ description: 'Cost category' })
  readonly category!: string;

  @IsNumber()
  @ApiProperty({ description: 'Amount' })
  readonly amount!: number;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Currency code', required: false })
  readonly currency?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Description', required: false })
  readonly description?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Vendor name', required: false })
  readonly vendor?: string;

  @IsDateString()
  @ApiProperty({ description: 'Record date' })
  readonly date!: string;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ description: 'Is recurring', required: false })
  readonly isRecurring?: boolean;
}
