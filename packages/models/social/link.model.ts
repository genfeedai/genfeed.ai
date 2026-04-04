import type { ILink } from '@cloud/interfaces';
import { Link as BaseLink } from '@genfeedai/client/models';
import { Brand } from '@models/organization/brand.model';

export class Link extends BaseLink {
  constructor(partial: Partial<ILink>) {
    super(partial);

    if (
      partial?.brand &&
      typeof partial.brand === 'object' &&
      'id' in partial.brand
    ) {
      this.brand = new Brand(partial.brand as unknown as Partial<Brand>);
    }
  }
}
