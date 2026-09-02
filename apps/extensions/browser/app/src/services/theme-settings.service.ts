import {
  DEFAULT_THEME,
  isThemePreference,
  type ThemePreference,
} from '@genfeedai/contracts/constants';
import { authService } from '~services/auth.service';
import { EnvironmentService } from '~services/environment.service';

interface SettingsDocument {
  data?: {
    attributes?: {
      theme?: unknown;
    };
  };
}

const SETTINGS_ENDPOINT = `${EnvironmentService.apiEndpoint}/users/me/settings`;

async function requireSuccessfulResponse(
  response: Response,
  operation: 'load' | 'update',
): Promise<void> {
  if (!response.ok) {
    throw new Error(
      `Unable to ${operation} account theme (${response.status} ${response.statusText})`,
    );
  }
}

class ThemeSettingsService {
  async getTheme(): Promise<ThemePreference> {
    const response = await authService.makeAuthenticatedRequest(
      SETTINGS_ENDPOINT,
      { method: 'GET' },
    );
    await requireSuccessfulResponse(response, 'load');

    const document = (await response.json()) as SettingsDocument;
    const theme = document.data?.attributes?.theme;
    return isThemePreference(theme) ? theme : DEFAULT_THEME;
  }

  async updateTheme(theme: ThemePreference): Promise<void> {
    const response = await authService.makeAuthenticatedRequest(
      SETTINGS_ENDPOINT,
      {
        body: JSON.stringify({ theme }),
        method: 'PATCH',
      },
    );
    await requireSuccessfulResponse(response, 'update');
  }
}

export const themeSettingsService = new ThemeSettingsService();
