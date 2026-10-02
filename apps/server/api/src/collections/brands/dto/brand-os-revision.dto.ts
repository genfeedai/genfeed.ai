import type { IBrandKitDraft } from '@genfeedai/contracts/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsISO8601,
  IsObject,
  Length,
  Matches,
  ValidateIf,
} from 'class-validator';

export class CreateBrandOsRevisionDto {
  @ApiProperty({ description: 'Brand OS draft content', type: Object })
  @IsObject()
  content!: IBrandKitDraft;
}

export class UpdateBrandOsRevisionDto extends CreateBrandOsRevisionDto {
  @ApiProperty({ description: 'updatedAt of the revision being edited' })
  @IsISO8601({ strict: true })
  updatedAt!: string;
}

export class ApproveBrandOsRevisionDto {
  @ApiProperty({ description: 'updatedAt of the reviewed draft' })
  @IsISO8601({ strict: true })
  updatedAt!: string;

  @ApiProperty({
    description: 'Digest of the saved generation rules reviewed',
    required: false,
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Length(71, 71)
  @Matches(/^sha256:[0-9a-f]{64}$/)
  reviewedGenerationRulesHash?: string;
}
