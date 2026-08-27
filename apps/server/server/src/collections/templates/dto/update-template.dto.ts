import { CreateTemplateDto } from '@server/collections/templates/dto/create-template.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdateTemplateDto extends PartialType(CreateTemplateDto) {}
