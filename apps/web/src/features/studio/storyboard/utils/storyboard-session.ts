/** Better Auth session extras are not on the generated session type. */
export function sessionActiveOrganizationId(session: {
  data?: { session?: object } | null;
}): string | undefined {
  const value = session.data?.session;
  if (!value || !('activeOrganizationId' in value)) return undefined;
  const id = value.activeOrganizationId;
  return typeof id === 'string' ? id : undefined;
}
