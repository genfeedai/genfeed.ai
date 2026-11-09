import { BrandKitSlot } from '@genfeedai/contracts';
import type { IBrandKitPlatformFillRequest } from '@genfeedai/contracts/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum } from 'class-validator';

export class FillPlatformSlotsDto implements IBrandKitPlatformFillRequest {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(Object.keys(BrandKitSlot).length)
  @IsEnum(BrandKitSlot, { each: true })
  @ApiProperty({
    description: 'Platform image slots to fill from the master banner.',
    enum: BrandKitSlot,
    enumName: 'BrandKitSlot',
    isArray: true,
  })
  readonly slots!: BrandKitSlot[];
}
