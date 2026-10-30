/**
 * CRM lead lifecycle. Values match Prisma `LeadStatus` (SCREAMING_SNAKE).
 * @see packages/prisma/prisma/schema.prisma `enum LeadStatus`
 */
export enum LeadStatus {
  NEW = 'NEW',
  CONTACTED = 'CONTACTED',
  QUALIFIED = 'QUALIFIED',
  CONVERTED = 'CONVERTED',
  LOST = 'LOST',
}
