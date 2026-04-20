import { OrganizationalCreateDto } from '@api/shared/dto/base/base.dto';
import { ActivityEntityModel } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class CreateActivityDto extends OrganizationalCreateDto {
  @IsMongoId()
  @ApiProperty({ required: true })
  readonly brand!: string;

  @IsString()
  @ApiProperty({ required: true })
  readonly source!: string;

  @IsString()
  @ApiProperty({ required: true })
  readonly key!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly value?: string;

  @IsEnum(ActivityEntityModel)
  @IsOptional()
  @ValidateIf((o) => o.entityId !== undefined)
  @IsNotEmpty()
  @ApiProperty({
    description: 'Entity model name',
    enum: ActivityEntityModel,
    enumName: 'ActivityEntityModel',
    required: false,
  })
  readonly entityModel?: ActivityEntityModel;

  @IsMongoId()
  @IsOptional()
  @ValidateIf((o) => o.entityModel !== undefined)
  @IsNotEmpty()
  @ApiProperty({
    description: 'Entity ID reference',
    required: false,
  })
  readonly entityId?: string;
}
