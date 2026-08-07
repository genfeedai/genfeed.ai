/**
 * Brand context interview session lifecycle.
 * Values match Prisma `BrandInterviewStatus` (SCREAMING_SNAKE).
 * @see packages/prisma/prisma/schema.prisma `enum BrandInterviewStatus`
 */
export enum BrandInterviewStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  ABANDONED = 'ABANDONED',
}
