import { OrganizationCategory } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';

export class SetAccountTypeDto {
  @IsEnum(OrganizationCategory)
  @IsNotEmpty()
  @ApiProperty({
    description: 'The organization category type',
    enum: OrganizationCategory,
    enumName: 'OrganizationCategory',
    example: OrganizationCategory.CREATOR,
  })
  category!: OrganizationCategory;
}
