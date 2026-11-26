import type { LibraryElementKind } from '@genfeedai/contracts';
import type {
  CreateLibraryElementInput,
  IPaginatedResponse,
  LibraryElementListItem,
} from '@genfeedai/contracts/interfaces';
import { BaseService } from '@services/core/base.service';

/** One row of the References list: a character or a Library element. */
export class LibraryElement implements LibraryElementListItem {
  availabilityMode!: LibraryElementListItem['availabilityMode'];
  availableBrandIds: string[] = [];
  coverIngredientId: string | null = null;
  description: string | null = null;
  handle: string | null = null;
  id!: string;
  kind!: LibraryElementKind;
  label!: string;
  owningBrandId: string | null = null;
  referenceIngredientIds: string[] = [];
  updatedAt!: string;

  constructor(partial: Partial<LibraryElement>) {
    Object.assign(this, partial);
  }
}

export type UpdateLibraryElementInput = Partial<
  Omit<CreateLibraryElementInput, 'type'>
>;

export class LibraryElementsService extends BaseService<
  LibraryElement,
  CreateLibraryElementInput,
  UpdateLibraryElementInput
> {
  constructor(token: string) {
    super('/library-elements', token, LibraryElement);
  }

  public static getInstance(token: string): LibraryElementsService {
    return BaseService.getDataServiceInstance(LibraryElementsService, token);
  }

  /** Characters and elements the active brand can use, newest edit first. */
  listPage(
    query: {
      kind?: readonly LibraryElementKind[];
      limit?: number;
      page?: number;
      q?: string;
    } = {},
    signal?: AbortSignal,
  ): Promise<IPaginatedResponse<LibraryElement>> {
    const { kind, ...rest } = query;
    return this.findAllPage(
      { ...rest, ...(kind?.length ? { kind: kind.join(',') } : {}) },
      signal,
    );
  }

  /** Soft delete; the API answers 204 with no body. */
  async removeElement(id: string): Promise<void> {
    await this.executeWithErrorHandling(
      `DELETE ${this.baseURL}/${id}`,
      this.instance.delete(`/${id}`),
    );
  }
}
