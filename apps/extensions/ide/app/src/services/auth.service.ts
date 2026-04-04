import { captureExtensionError } from '@services/error-tracking.service';
import * as vscode from 'vscode';
import type { AuthState } from '@/types';

const AUTH_SECRET_KEY = 'genfeed.auth';
const API_KEY_SECRET = 'genfeed.apiKey';
const IDE_AUTH_CLIENT = 'extension-ide';
const LEGACY_IDE_AUTH_CLIENT = 'genfeed-cursor';
const IDE_CALLBACK_AUTHORITY = 'genfeedai.extension-ide';

interface DeviceFlowStartResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  expiresIn?: number;
  interval?: number;
}

interface DeviceFlowPollResponse {
  accessToken?: string;
  error?: string;
}

export class AuthService {
  private static instance: AuthService;
  private context: vscode.ExtensionContext;
  private authState: AuthState = {
    isAuthenticated: false,
    method: null,
  };

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  static initialize(context: vscode.ExtensionContext): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService(context);
    }
    return AuthService.instance;
  }

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      throw new Error('AuthService not initialized. Call initialize() first.');
    }
    return AuthService.instance;
  }

  async loadStoredAuth(): Promise<AuthState> {
    const storedAuth = await this.context.secrets.get(AUTH_SECRET_KEY);
    if (storedAuth) {
      try {
        this.authState = JSON.parse(storedAuth);
      } catch {
        this.authState = { isAuthenticated: false, method: null };
      }
    }

    const apiKey = await this.context.secrets.get(API_KEY_SECRET);
    if (apiKey && !this.authState.isAuthenticated) {
      this.authState = {
        isAuthenticated: true,
        method: 'apiKey',
      };
    }

    return this.authState;
  }

  async authenticateWithOAuth(): Promise<boolean> {
    const callbackAuthority = vscode.workspace
      .getConfiguration('genfeed')
      .get<string>('oauthCallbackAuthority', IDE_CALLBACK_AUTHORITY);

    const callbackUri = await vscode.env.asExternalUri(
      vscode.Uri.parse(
        `${vscode.env.uriScheme}://${callbackAuthority}/callback`,
      ),
    );

    const authUrl = `https://accounts.genfeed.ai/sign-in?redirect_url=${encodeURIComponent(callbackUri.toString())}`;

    const opened = await vscode.env.openExternal(vscode.Uri.parse(authUrl));
    if (!opened) {
      vscode.window.showErrorMessage('Failed to open authentication page');
      return false;
    }

    return new Promise((resolve) => {
      const disposable = vscode.window.registerUriHandler({
        handleUri: async (uri: vscode.Uri) => {
          disposable.dispose();

          const token = uri.query
            .split('&')
            .find((p) => p.startsWith('token='))
            ?.split('=')[1];

          if (token) {
            await this.setOAuthToken(token, 'oauth');
            resolve(true);
          } else {
            vscode.window.showErrorMessage(
              'Authentication failed: No token received',
            );
            resolve(false);
          }
        },
      });

      setTimeout(() => {
        disposable.dispose();
        if (!this.authState.isAuthenticated) {
          vscode.window.showWarningMessage('Authentication timed out');
          resolve(false);
        }
      }, 300000); // 5 minute timeout
    });
  }

  async authenticateWithDeviceFlow(): Promise<boolean> {
    try {
      const flow = await this.startDeviceFlow();
      const verificationUri =
        flow.verificationUriComplete ||
        `${flow.verificationUri}?user_code=${encodeURIComponent(flow.userCode)}`;

      const authPrompt = await vscode.window.showInformationMessage(
        `Use code ${flow.userCode} to sign in with Clerk device flow.`,
        'Open Verification',
        'Copy Code',
        'Cancel',
      );

      if (authPrompt === 'Cancel') {
        return false;
      }

      if (authPrompt === 'Copy Code') {
        await vscode.env.clipboard.writeText(flow.userCode);
      }

      if (authPrompt === 'Open Verification' || authPrompt === 'Copy Code') {
        await vscode.env.openExternal(vscode.Uri.parse(verificationUri));
      }

      const maxDurationMs = (flow.expiresIn ?? 600) * 1000;
      const pollIntervalMs = Math.max((flow.interval ?? 5) * 1000, 2000);
      const startedAt = Date.now();

      const token = await vscode.window.withProgress(
        {
          cancellable: true,
          location: vscode.ProgressLocation.Notification,
          title: 'Waiting for device authorization...',
        },
        async (_progress, cancellationToken) => {
          while (Date.now() - startedAt < maxDurationMs) {
            if (cancellationToken.isCancellationRequested) {
              return undefined;
            }

            const response = await this.pollDeviceFlow(flow.deviceCode);
            if (response.accessToken) {
              return response.accessToken;
            }

            if (
              response.error &&
              !['authorization_pending', 'slow_down'].includes(response.error)
            ) {
              throw new Error(response.error);
            }

            await delay(pollIntervalMs);
          }

          return undefined;
        },
      );

      if (!token) {
        vscode.window.showWarningMessage('Device sign in timed out.');
        return false;
      }

      await this.setOAuthToken(token, 'deviceFlow');
      return true;
    } catch (error) {
      captureExtensionError('Auth: device flow failed', error, {
        operation: 'authenticateWithDeviceFlow',
      });
      const errorMessage =
        error instanceof Error ? error.message : 'Device flow failed';
      const fallback = await vscode.window.showWarningMessage(
        `Device flow unavailable (${errorMessage}). Use browser sign in instead?`,
        'Use Browser Sign In',
        'Cancel',
      );

      if (fallback === 'Use Browser Sign In') {
        return this.authenticateWithOAuth();
      }

      return false;
    }
  }

  async setOAuthToken(
    token: string,
    method: 'oauth' | 'deviceFlow' = 'oauth',
  ): Promise<void> {
    const userInfo = await this.fetchUserInfo(token);

    this.authState = {
      email: userInfo?.email,
      isAuthenticated: true,
      method,
      organizationId: userInfo?.organizationId,
      userId: userInfo?.id,
    };

    await this.context.secrets.store(
      AUTH_SECRET_KEY,
      JSON.stringify(this.authState),
    );
    await this.context.secrets.store(API_KEY_SECRET, token);

    vscode.window.showInformationMessage(
      `Signed in to Genfeed.ai as ${userInfo?.email || 'user'}`,
    );
  }

  async setApiKey(apiKey: string): Promise<boolean> {
    const isValid = await this.validateApiKey(apiKey);
    if (!isValid) {
      vscode.window.showErrorMessage('Invalid API key');
      return false;
    }

    await this.context.secrets.store(API_KEY_SECRET, apiKey);

    this.authState = {
      isAuthenticated: true,
      method: 'apiKey',
    };
    await this.context.secrets.store(
      AUTH_SECRET_KEY,
      JSON.stringify(this.authState),
    );

    vscode.window.showInformationMessage('API key saved successfully');
    return true;
  }

  getToken(): Thenable<string | undefined> {
    return this.context.secrets.get(API_KEY_SECRET);
  }

  async signOut(): Promise<void> {
    await this.context.secrets.delete(AUTH_SECRET_KEY);
    await this.context.secrets.delete(API_KEY_SECRET);

    this.authState = {
      isAuthenticated: false,
      method: null,
    };

    vscode.window.showInformationMessage('Signed out of Genfeed.ai');
  }

  getAuthState(): AuthState {
    return this.authState;
  }

  isAuthenticated(): boolean {
    return this.authState.isAuthenticated;
  }

  private async fetchUserInfo(
    token: string,
  ): Promise<{ id: string; email: string; organizationId?: string } | null> {
    try {
      const config = vscode.workspace.getConfiguration('genfeed');
      const apiEndpoint = config.get<string>(
        'apiEndpoint',
        'https://api.genfeed.ai',
      );

      const response = await fetch(`${apiEndpoint}/users/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as {
        data: {
          id: string;
          attributes: { email: string; organization?: string };
        };
      };
      return {
        email: data.data.attributes.email,
        id: data.data.id,
        organizationId: data.data.attributes.organization,
      };
    } catch (error) {
      captureExtensionError('Auth: fetch user info failed', error, {
        operation: 'fetchUserInfo',
      });
      return null;
    }
  }

  private async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const config = vscode.workspace.getConfiguration('genfeed');
      const apiEndpoint = config.get<string>(
        'apiEndpoint',
        'https://api.genfeed.ai',
      );

      const response = await fetch(`${apiEndpoint}/users/me`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      return response.ok;
    } catch (error) {
      captureExtensionError('Auth: API key validation failed', error, {
        operation: 'validateApiKey',
      });
      return false;
    }
  }

  private getAuthEndpoint(): string {
    const config = vscode.workspace.getConfiguration('genfeed');
    return config.get<string>('authEndpoint', 'https://accounts.genfeed.ai');
  }

  private async startDeviceFlow(): Promise<DeviceFlowStartResponse> {
    const response = await this.startDeviceFlowForClient(IDE_AUTH_CLIENT);
    const fallbackResponse =
      !response.ok && response.status === 400
        ? await this.startDeviceFlowForClient(LEGACY_IDE_AUTH_CLIENT)
        : response;

    if (!fallbackResponse.ok) {
      throw new Error(`Device flow start failed (${fallbackResponse.status})`);
    }

    const payload =
      (await fallbackResponse.json()) as Partial<DeviceFlowStartResponse>;

    if (!payload.deviceCode || !payload.userCode || !payload.verificationUri) {
      throw new Error('Device flow payload is incomplete');
    }

    return {
      deviceCode: payload.deviceCode,
      expiresIn: payload.expiresIn,
      interval: payload.interval,
      userCode: payload.userCode,
      verificationUri: payload.verificationUri,
      verificationUriComplete: payload.verificationUriComplete,
    };
  }

  private startDeviceFlowForClient(client: string): Promise<Response> {
    return fetch(`${this.getAuthEndpoint()}/api/device-flow/start`, {
      body: JSON.stringify({ client }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });
  }

  private async pollDeviceFlow(
    deviceCode: string,
  ): Promise<DeviceFlowPollResponse> {
    const response = await fetch(
      `${this.getAuthEndpoint()}/api/device-flow/poll`,
      {
        body: JSON.stringify({ deviceCode }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      },
    );

    const payload = (await response.json()) as DeviceFlowPollResponse;

    if (!response.ok) {
      return {
        error: payload.error || `http_${response.status}`,
      };
    }

    if (payload.accessToken) {
      return payload;
    }

    return {
      error: payload.error || 'authorization_pending',
    };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
