import { CreateTemplateDto } from '@api/collections/templates/dto/create-template.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdateTemplateDto extends PartialType(CreateTemplateDto) {}
