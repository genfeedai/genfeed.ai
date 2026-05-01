import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { AssetScope } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export abstract class BaseCreateDto {
  @IsEntityId()
  @IsOptional()
  @ApiProperty({
    description: 'The unique identifier of the document',
    required: false,
  })
  readonly _id?: string;
}

export abstract class OrganizationalCreateDto extends BaseCreateDto {
  @IsEntityId()
  @ApiProperty({
    description: 'The user ID who created this resource',
    required: true,
  })
  readonly user!: string;

  @IsEntityId()
  @ApiProperty({
    description: 'The organization ID that owns this resource',
    required: true,
  })
  readonly organization!: string;
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
  @IsEntityId()
  @IsOptional()
  @ApiProperty({
    description: 'The unique identifier of the document',
    required: false,
  })
  readonly _id?: string;
}

export abstract class OrganizationalUpdateDto extends BaseUpdateDto {
  @IsEntityId()
  @IsOptional()
  @ApiProperty({
    description: 'The user ID who owns this resource',
    required: false,
  })
  readonly user?: string;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({
    description: 'The organization ID that owns this resource',
    required: false,
  })
  readonly organization?: string;
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
