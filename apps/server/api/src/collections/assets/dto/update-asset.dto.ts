import { CreateAssetDto } from '@api/collections/assets/dto/create-asset.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateAssetDto extends PartialType(CreateAssetDto) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the asset is marked as deleted',
    required: false,
  })
  readonly isDeleted!: boolean;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description:
      'External ID for tracking async generation (e.g., Replicate prediction ID)',
    required: false,
  })
  readonly externalId?: string;
}
