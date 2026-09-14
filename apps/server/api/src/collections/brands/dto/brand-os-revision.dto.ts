import type { IBrandKitDraft } from '@genfeedai/contracts/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsObject } from 'class-validator';

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
}
