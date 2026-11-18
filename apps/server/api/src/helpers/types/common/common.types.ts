export interface BasePaginationQuery {
  page?: number;
  limit?: number;
  pagination?: boolean;
  sort?: string;
  isDeleted?: boolean;
}

// Fields shared by every Prisma-backed entity.
interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
}

// Generic internal document shape backed by a Prisma row.
export type EntityDocument<T> = T &
  BaseEntity & {
    [key: string]: unknown;
  };
