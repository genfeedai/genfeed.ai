import { CreateNewsletterDto } from '@api/collections/newsletters/dto/create-newsletter.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdateNewsletterDto extends PartialType(CreateNewsletterDto) {}
