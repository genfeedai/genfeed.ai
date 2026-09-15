import type { OutlierAccountType } from '@genfeedai/contracts/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class OutlierPaginationDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  page = 1;
  @ApiProperty({ required: false, default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
export class OutlierAccountDto {
  @ApiProperty() @IsString() @IsNotEmpty() brandId!: string;
  @ApiProperty({ enum: ['credential', 'social_source'] })
  @IsIn(['credential', 'social_source'])
  accountType!: OutlierAccountType;
  @ApiProperty() @IsString() @IsNotEmpty() accountId!: string;
}
export class OutlierQueryDto extends OutlierPaginationDto {
  @ApiProperty() @IsString() @IsNotEmpty() brandId!: string;
  @ApiProperty({ enum: ['credential', 'social_source'] })
  @IsIn(['credential', 'social_source'])
  accountType!: OutlierAccountType;
  @ApiProperty() @IsString() @IsNotEmpty() accountId!: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  platform?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  contentType?: string;
}
