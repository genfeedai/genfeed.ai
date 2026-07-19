import { CreateListeningTopicDto } from '@api/collections/listening-topics/dto/create-listening-topic.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdateListeningTopicDto extends PartialType(
  CreateListeningTopicDto,
) {}
