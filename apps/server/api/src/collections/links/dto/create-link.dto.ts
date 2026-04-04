import { LinkCategory } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsString, IsUrl } from 'class-validator';
import { Types } from 'mongoose';

export class CreateLinkDto {
  @IsMongoId()
  @ApiProperty({
    description: 'The brand ID this link belongs to',
    required: true,
  })
  readonly brand!: Types.ObjectId;

  @IsString()
  @ApiProperty({ description: 'The display name of the link', required: true })
  readonly label!: string;

  @IsString()
  @IsEnum(LinkCategory)
  @ApiProperty({
    default: LinkCategory.OTHER,
    description: 'The type/category of the link',
    enum: LinkCategory,
    enumName: 'LinkCategory',
    required: true,
  })
  readonly category!: LinkCategory;

  @IsUrl()
  @ApiProperty({ description: 'The URL of the link', required: true })
  readonly url!: string;
}
