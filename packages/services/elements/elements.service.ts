import type {
  IElementBlacklist,
  IElementCamera,
  IElementCameraMovement,
  IElementLens,
  IElementLighting,
  IElementMood,
  IElementScene,
  IElementStyle,
  ISound,
} from '@cloud/interfaces';
import { API_ENDPOINTS } from '@genfeedai/constants';
import {
  deserializeCollection,
  type JsonApiResponseDocument,
} from '@helpers/data/json-api/json-api.helper';
import { EnvironmentService } from '@services/core/environment.service';
import axios from 'axios';

export interface ElementsData {
  cameras: IElementCamera[];
  moods: IElementMood[];
  scenes: IElementScene[];
  styles: IElementStyle[];
  sounds: ISound[];
  blacklists: IElementBlacklist[];
  lightings: IElementLighting[];
  lenses: IElementLens[];
  cameraMovements: IElementCameraMovement[];
}

export class ElementsService {
  /**
   * Fetch all element collections in a single request
   * This is more efficient than making 9 separate requests
   */
  static async findAllElements(token: string): Promise<ElementsData> {
    return await axios
      .get(`${EnvironmentService.apiEndpoint}${API_ENDPOINTS.ELEMENTS}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      .then((res) => res.data)
      .then((data) => data.data)
      .then((raw: Record<string, JsonApiResponseDocument>) => ({
        blacklists: deserializeCollection<IElementBlacklist>(raw.blacklists),
        cameraMovements: deserializeCollection<IElementCameraMovement>(
          raw.cameraMovements,
        ),
        cameras: deserializeCollection<IElementCamera>(raw.cameras),
        lenses: deserializeCollection<IElementLens>(raw.lenses),
        lightings: deserializeCollection<IElementLighting>(raw.lightings),
        moods: deserializeCollection<IElementMood>(raw.moods),
        scenes: deserializeCollection<IElementScene>(raw.scenes),
        sounds: deserializeCollection<ISound>(raw.sounds),
        styles: deserializeCollection<IElementStyle>(raw.styles),
      }));
  }
}
