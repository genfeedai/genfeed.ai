import {
  DEFAULT_THEME,
  isThemePreference,
  type ThemePreference,
} from '@genfeedai/contracts/constants';
import { apiRequest } from '@/services/api/base-http.service';

interface SettingsResponse {
  data?: {
    attributes?: {
      theme?: unknown;
    };
    id: string;
    type: 'setting';
  };
}

class MobileSettingsService {
  async getTheme(token: string): Promise<ThemePreference> {
    const response = await apiRequest<SettingsResponse>(
      token,
      'users/me/settings',
    );
    const theme = response.data?.attributes?.theme;

    return isThemePreference(theme) ? theme : DEFAULT_THEME;
  }

  async updateTheme(token: string, theme: ThemePreference): Promise<void> {
    await apiRequest<SettingsResponse>(token, 'users/me/settings', {
      body: { theme },
      method: 'PATCH',
    });
  }
}

export const mobileSettingsService = new MobileSettingsService();
