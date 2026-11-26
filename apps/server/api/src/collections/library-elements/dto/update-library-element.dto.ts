import { CreateLibraryElementDto } from '@api/collections/library-elements/dto/create-library-element.dto';
import { PartialType } from '@nestjs/swagger';

/** The type of an element never changes: a style cannot become a prop. */
export class UpdateLibraryElementDto extends PartialType(
  CreateLibraryElementDto,
) {}
