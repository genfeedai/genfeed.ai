import { PartialType } from '@nestjs/swagger';
import { CreateRssSourceDto } from '@server/collections/rss-sources/dto/create-rss-source.dto';

export class UpdateRssSourceDto extends PartialType(CreateRssSourceDto) {}
