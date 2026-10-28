/**
 * The structured prompt slots a first-run image request carries next to its
 * lead sentence. `blacklist` is the avoid list, sent as the negative prompt.
 */
export interface FirstRunImageSlots {
  action?: string;
  blacklist?: string[];
  camera?: string;
  lens?: string;
  lighting?: string;
  mood?: string;
  scene?: string;
  style?: string;
  subject?: string;
}
