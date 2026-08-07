/**
 * Integration platform. Values match Prisma `IntegrationPlatform`.
 * @see packages/prisma/prisma/schema.prisma `enum IntegrationPlatform`
 */
export enum IntegrationPlatform {
  TELEGRAM = 'TELEGRAM',
  SLACK = 'SLACK',
  DISCORD = 'DISCORD',
  UNIPILE = 'UNIPILE',
}

/**
 * Integration lifecycle. Values match Prisma `IntegrationStatus`.
 * @see packages/prisma/prisma/schema.prisma `enum IntegrationStatus`
 */
export enum IntegrationStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  ERROR = 'ERROR',
}
