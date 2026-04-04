import type { ModelCategory } from '@genfeedai/enums';

export interface IBaseElement {
  id: string;
  key: string;
  label: string;
  description?: string;
  type?: ModelCategory;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ISelectableElement extends IBaseElement {
  isSelected?: boolean;
  isFavorite?: boolean;
}

export interface IVisualElement extends IBaseElement {
  image?: string;
  thumbnail?: string;
  color?: string;
}

export interface IStyle extends ISelectableElement {
  type: ModelCategory;
}

export interface IMood extends ISelectableElement {
  type: ModelCategory;
}

export interface IScene extends ISelectableElement {
  type: ModelCategory;
}

export interface ICamera extends IBaseElement {}

export interface IFontFamily extends IBaseElement {
  value: string;
  category?: string;
}

export interface IBlacklist extends IBaseElement {}

export interface ISound extends IBaseElement {
  url?: string;
  duration?: number;
}

export interface IPreset extends IVisualElement {
  style?: string;
  mood?: string;
  scene?: string;
  camera?: string;
  fontFamily?: string;
  blacklist?: string[];
  sounds?: string[];
  tags?: string[];
  scope?: boolean;
  owner?: string;
}

export interface IElementsResponse<T extends IBaseElement> {
  items: T[];
  total: number;
  page?: number;
  limit?: number;
}

export interface IElementsCollection {
  styles: IStyle[];
  moods: IMood[];
  scenes: IScene[];
  cameras: ICamera[];
  fontFamilies: IFontFamily[];
  blacklists: IBlacklist[];
  sounds: ISound[];
  presets: IPreset[];
}

export interface IElementSelectionState {
  style?: string;
  mood?: string;
  scene?: string;
  camera?: string;
  fontFamily?: string;
  blacklist?: string[];
  sounds?: string[];
  preset?: string;
}
