import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';

export class StartTrainingDto {
  @IsString()
  @ApiProperty({ description: 'Persona slug' })
  readonly personaSlug!: string;

  @IsString()
  @ApiProperty({ description: 'Training label' })
  readonly label!: string;

  // Validate each id at the HTTP boundary so a malformed id can never reach
  // ObjectIdUtil.toObjectId (which returns null) and get non-null-asserted into
  // a null entry in the persisted `sources` array. @IsEntityId mirrors exactly
  // what toObjectId accepts (ObjectId / UUID / CUID / CUID2 / ULID).
  @IsArray()
  @IsEntityId({ each: true })
  @ApiProperty({ description: 'Source ingredient IDs', type: [String] })
  readonly sourceIds!: string[];

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'LoRA name', required: false })
  readonly loraName?: string;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Training steps', required: false })
  readonly steps?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Learning rate', required: false })
  readonly learningRate?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'LoRA rank', required: false })
  readonly loraRank?: number;

  @IsString()
  @IsOptional()
  @ApiProperty({
    default: 'genfeed-ai/z-image-turbo',
    description: 'Base model for training',
    required: false,
  })
  readonly baseModel?: string;
}
