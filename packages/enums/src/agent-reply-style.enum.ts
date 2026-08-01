/**
 * Matches Prisma `AgentReplyStyle` / Postgres enum values (UPPER_SNAKE).
 * Do not lowercase — API reads/writes the Prisma values as-is.
 */
export enum AgentReplyStyle {
  CONCISE = 'CONCISE',
  DETAILED = 'DETAILED',
  FRIENDLY = 'FRIENDLY',
  PROFESSIONAL = 'PROFESSIONAL',
}
