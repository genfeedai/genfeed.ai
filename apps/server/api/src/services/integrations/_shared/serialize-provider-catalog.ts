import { HttpException, HttpStatus } from '@nestjs/common';

export type ProviderCatalogResponse<TType extends string, TAttributes> = {
  data: {
    attributes: TAttributes;
    type: TType;
  };
};

export type ProviderCatalogIdResponse<TType extends string, TAttributes> = {
  data: {
    attributes: TAttributes;
    id: string;
    type: TType;
  };
};

export function serializeProviderCatalog<
  TType extends string,
  TAttributes,
>(params: {
  attributes: TAttributes;
  id: string;
  type: TType;
}): ProviderCatalogIdResponse<TType, TAttributes>;
export function serializeProviderCatalog<
  TType extends string,
  TAttributes,
>(params: {
  attributes: TAttributes;
  type: TType;
}): ProviderCatalogResponse<TType, TAttributes>;
export function serializeProviderCatalog<TType extends string, TAttributes>({
  attributes,
  id,
  type,
}: {
  attributes: TAttributes;
  id?: string;
  type: TType;
}):
  | ProviderCatalogResponse<TType, TAttributes>
  | ProviderCatalogIdResponse<TType, TAttributes> {
  if (id === undefined) {
    return {
      data: {
        attributes,
        type,
      },
    };
  }

  return {
    data: {
      attributes,
      id,
      type,
    },
  };
}

function resolveProviderCatalogErrorDetail(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return 'Unknown error occurred';
}

export function throwProviderCatalogError(
  title: string,
  error: unknown,
): never {
  throw new HttpException(
    {
      detail: resolveProviderCatalogErrorDetail(error),
      title,
    },
    HttpStatus.INTERNAL_SERVER_ERROR,
  );
}
