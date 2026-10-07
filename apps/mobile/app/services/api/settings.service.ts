import {
  DEFAULT_THEME,
  isThemePreference,
  type ThemePreference,
} from '@genfeedai/contracts/constants';
import type {
  ISetting,
  JsonApiSingleResponse,
} from '@genfeedai/contracts/interfaces';
import { apiRequest } from '@/services/api/base-http.service';

class MobileSettingsService {
  async getTheme(token: string): Promise<ThemePreference> {
    const response = await apiRequest<JsonApiSingleResponse<Partial<ISetting>>>(
      token,
      'users/me/settings',
    );
    const theme = response.data?.attributes?.theme;

    return isThemePreference(theme) ? theme : DEFAULT_THEME;
  }

  async updateTheme(token: string, theme: ThemePreference): Promise<void> {
    await apiRequest<JsonApiSingleResponse<Partial<ISetting>>>(
      token,
      'users/me/settings',
      {
        body: { theme },
        method: 'PATCH',
      },
    );
  }
}

export const mobileSettingsService = new MobileSettingsService();
