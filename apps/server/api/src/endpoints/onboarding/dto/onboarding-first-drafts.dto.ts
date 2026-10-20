import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class OnboardingScanDto {
  @IsString()
  @MaxLength(2048)
  @ApiProperty({
    description: 'A public link about the brand: website, profile or link page',
    example: 'https://example.com',
  })
  url!: string;
}

export class OnboardingDraftContextDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @ApiPropertyOptional({ description: 'Who the posts are for' })
  audience?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  @ApiPropertyOptional({
    description: 'What the posts should work toward',
    type: [String],
  })
  goals?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @ApiPropertyOptional({ description: 'What the brand sells or offers' })
  offer?: string;

  @IsOptional()
  @IsIn(['keep', 'casual', 'professional'])
  @ApiPropertyOptional({ enum: ['keep', 'casual', 'professional'] })
  tone?: 'keep' | 'casual' | 'professional';
}

export class OnboardingDraftsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => OnboardingDraftContextDto)
  @ApiPropertyOptional({
    description:
      'Brand context from the "doesn\'t look right" round. Saved on the brand and applied to the new drafts.',
    type: OnboardingDraftContextDto,
  })
  context?: OnboardingDraftContextDto;

  @IsOptional()
  @IsUUID('4')
  @ApiPropertyOptional({
    description:
      'Request key of the X draft being replaced, so the new draft is linked to it',
  })
  previousRequestKey?: string;
}
