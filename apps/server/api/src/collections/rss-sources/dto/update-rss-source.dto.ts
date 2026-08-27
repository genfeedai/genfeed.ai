import { CreateRssSourceDto } from '@api/collections/rss-sources/dto/create-rss-source.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdateRssSourceDto extends PartialType(CreateRssSourceDto) {}
