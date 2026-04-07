/**
 * Database connection name constants.
 * Used across modules, services, and forFeatureAsync/forRootAsync registrations
 * to avoid hardcoded connection name strings.
 *
 * The default (unnamed) connection maps to the 'cloud' database.
 */
export const DB_CONNECTIONS = {
  AGENT: 'agent',
  ANALYTICS: 'analytics',
  AUTH: 'auth',
  CLIPS: 'clips',
  CLOUD: 'cloud',
  CRM: 'crm',
  FANVUE: 'fanvue',
} as const;
