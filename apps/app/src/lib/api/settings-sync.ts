import type { EdgeStyle, ProviderType } from '@genfeedai/types';
import type {
  SettingsSyncService,
  SyncableSettings,
} from '@genfeedai/workflow-ui/provider';
import { settingsApi } from './settings';

/**
 * App-owned adapter injected into `@genfeedai/workflow-ui` via
 * `WorkflowUIConfig.settingsSync`. It maps the package settings store's
 * {@link SyncableSettings} to/from the app's `/settings` DTOs; the package store
 * owns the actual merge (it holds current state), so this layer only translates.
 *
 * Field-by-field behavior matches the pre-split app store: `pull` omits empty
 * server values (string/edge-style falsy → omit; booleans pass through) so the
 * package store's `?? local` fallback keeps a local preference the server has
 * never stored. `push` mirrors the old `syncToServer` — node defaults + UI
 * preferences only; recent models are written through their dedicated endpoint.
 */
export function createSettingsSyncService(): SettingsSyncService {
  return {
    pull: async (signal): Promise<Partial<SyncableSettings>> => {
      const server = await settingsApi.getAll(signal);

      const defaults: Partial<SyncableSettings['defaults']> = {};
      if (server.nodeDefaults.imageModel) {
        defaults.imageModel = server.nodeDefaults.imageModel;
      }
      if (server.nodeDefaults.imageProvider) {
        defaults.imageProvider = server.nodeDefaults
          .imageProvider as ProviderType;
      }
      if (server.nodeDefaults.videoModel) {
        defaults.videoModel = server.nodeDefaults.videoModel;
      }
      if (server.nodeDefaults.videoProvider) {
        defaults.videoProvider = server.nodeDefaults
          .videoProvider as ProviderType;
      }

      const result: Partial<SyncableSettings> = {
        recentModels: server.recentModels.map((model) => ({
          displayName: model.displayName,
          id: model.id,
          provider: model.provider as ProviderType,
          timestamp: model.timestamp ?? Date.now(),
        })),
      };

      if (Object.keys(defaults).length > 0) {
        result.defaults = defaults as SyncableSettings['defaults'];
      }
      if (server.uiPreferences.edgeStyle) {
        result.edgeStyle = server.uiPreferences.edgeStyle as EdgeStyle;
      }
      if (server.uiPreferences.hasSeenWelcome != null) {
        result.hasSeenWelcome = server.uiPreferences.hasSeenWelcome;
      }
      if (server.uiPreferences.showMinimap != null) {
        result.showMinimap = server.uiPreferences.showMinimap;
      }

      return result;
    },

    push: async (settings: SyncableSettings): Promise<void> => {
      await settingsApi.update({
        nodeDefaults: {
          imageModel: settings.defaults.imageModel,
          imageProvider: settings.defaults.imageProvider,
          videoModel: settings.defaults.videoModel,
          videoProvider: settings.defaults.videoProvider,
        },
        uiPreferences: {
          edgeStyle: settings.edgeStyle,
          hasSeenWelcome: settings.hasSeenWelcome,
          showMinimap: settings.showMinimap,
        },
      });
    },
  };
}
