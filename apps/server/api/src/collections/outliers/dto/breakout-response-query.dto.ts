import { OutlierPaginationDto } from '@api/collections/outliers/dto/outlier-query.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class BreakoutResponseListDto extends OutlierPaginationDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  credentialId?: string;
}
export class BreakoutResponseDetailDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  strategyId?: string;
}
