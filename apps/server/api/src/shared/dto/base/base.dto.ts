import { AssetScope } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { Types } from 'mongoose';

export abstract class BaseCreateDto {
  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'The unique identifier of the document',
    required: false,
  })
  readonly _id?: string;
}

export abstract class OrganizationalCreateDto extends BaseCreateDto {
  @IsMongoId()
  @ApiProperty({
    description: 'The user ID who created this resource',
    required: true,
  })
  readonly user!: Types.ObjectId;

  @IsMongoId()
  @ApiProperty({
    description: 'The organization ID that owns this resource',
    required: true,
  })
  readonly organization!: Types.ObjectId;
}

export abstract class StatusCreateDto extends OrganizationalCreateDto {
  @IsString()
  @IsOptional()
  @ApiProperty({
    default: 'pending',
    description: 'The current status of the resource',
    required: false,
  })
  readonly status?: string;

  @IsEnum(AssetScope)
  @IsOptional()
  @ApiProperty({
    default: AssetScope.USER,
    description: 'The access scope of the resource',
    enum: AssetScope,
    enumName: 'AssetScope',
    required: false,
  })
  readonly scope?: AssetScope;
}

export abstract class LabeledCreateDto extends OrganizationalCreateDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'The display label/name of the resource',
    required: true,
  })
  readonly label!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Optional detailed description of the resource',
    required: false,
  })
  readonly description?: string;
}

export abstract class BaseUpdateDto {
  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'The unique identifier of the document',
    required: false,
  })
  readonly _id?: string;
}

export abstract class OrganizationalUpdateDto extends BaseUpdateDto {
  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'The user ID who owns this resource',
    required: false,
  })
  readonly user?: Types.ObjectId;

  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'The organization ID that owns this resource',
    required: false,
  })
  readonly organization?: Types.ObjectId;
}

export abstract class StatusUpdateDto extends OrganizationalUpdateDto {
  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The current status of the resource',
    required: false,
  })
  readonly status?: string;

  @IsEnum(AssetScope)
  @IsOptional()
  @ApiProperty({
    description: 'The access scope of the resource',
    enum: AssetScope,
    enumName: 'AssetScope',
    required: false,
  })
  readonly scope?: AssetScope;
}

export abstract class LabeledUpdateDto extends OrganizationalUpdateDto {
  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The display label/name of the resource',
    required: false,
  })
  readonly label?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Optional detailed description of the resource',
    required: false,
  })
  readonly description?: string;
}

export abstract class TypedUpdateDto extends LabeledUpdateDto {
  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The type/category of the resource',
    required: false,
  })
  readonly type?: string;
}
