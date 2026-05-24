import { NewsletterSourceRefDto } from '@api/collections/newsletters/dto/newsletter-source-ref.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class GenerateNewsletterDraftDto {
  @IsString()
  @MaxLength(200)
  @ApiProperty({ description: 'Newsletter topic' })
  topic!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @ApiProperty({ description: 'Optional angle', required: false })
  angle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ApiProperty({
    description: 'Optional generation instructions',
    required: false,
  })
  instructions?: string;

  @IsOptional()
  @IsEntityId()
  @ApiProperty({
    description: 'Existing newsletter to update',
    required: false,
  })
  newsletterId?: string;

  @IsOptional()
  @IsArray()
  @IsEntityId({ each: true })
  @ApiProperty({
    description: 'Override newsletter memory set',
    required: false,
    type: [String],
  })
  contextNewsletterIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NewsletterSourceRefDto)
  @ApiProperty({
    description: 'Additional source references',
    required: false,
    type: [NewsletterSourceRefDto],
  })
  sourceRefs?: NewsletterSourceRefDto[];
}
