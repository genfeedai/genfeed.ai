import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class PublishAssetDto {
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({ description: 'Platforms to publish to', type: [String] })
  readonly platforms!: string[];

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Caption for the post', required: false })
  readonly caption?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Campaign name', required: false })
  readonly campaign?: string;
}
