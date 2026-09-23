import { Command } from 'commander';
import { validateApiKey } from '@/api/auth';
import { getApiKey, getOrganizationId } from '@/config/store';
import { print } from '@/ui/theme';
import { AuthError, handleError } from '@/utils/errors';

export interface AuthStatus {
  isLoggedIn: boolean;
  organizationId?: string;
  scopes: string[];
}

/**
 * Login state from the active profile (including `GENFEED_API_KEY`).
 * Scopes are not stored locally; they come from `GET /auth/whoami`.
 */
export async function readAuthStatus(): Promise<AuthStatus> {
  const apiKey = await getApiKey();
  const storedOrganizationId = await getOrganizationId();

  if (!apiKey) {
    return {
      isLoggedIn: false,
      organizationId: storedOrganizationId,
      scopes: [],
    };
  }

  try {
    const account = await validateApiKey();

    return {
      isLoggedIn: true,
      organizationId: storedOrganizationId ?? account.organization.id,
      scopes: account.scopes,
    };
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        isLoggedIn: false,
        organizationId: storedOrganizationId,
        scopes: [],
      };
    }

    throw error;
  }
}

export function formatAuthStatus(status: AuthStatus): string {
  if (!status.isLoggedIn) {
    return [
      'Logged in: no',
      `Organization: ${status.organizationId ?? 'none'}`,
      'Scopes: none',
    ].join('\n');
  }

  const organization = status.organizationId ?? 'unknown';
  const scopes = status.scopes.length > 0 ? status.scopes.join(', ') : 'none';

  return [`Logged in: yes`, `Organization: ${organization}`, `Scopes: ${scopes}`].join('\n');
}

export function createAuthStatusCommand(): Command {
  return new Command('status')
    .description('Show whether you are logged in, plus the organization and API key scopes')
    .action(async () => {
      try {
        print(formatAuthStatus(await readAuthStatus()));
      } catch (error) {
        handleError(error);
      }
    });
}
