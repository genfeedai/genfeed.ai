import { describe, expectTypeOf, it } from 'vitest';
import type {
  StudioGenerateContextData,
  UseAssetActionsReturn,
  ViewModeState,
} from './types';

describe('studio generate types', () => {
  it('exposes the shared type contracts', () => {
    expectTypeOf<StudioGenerateContextData>().toMatchTypeOf<StudioGenerateContextData>();
    expectTypeOf<UseAssetActionsReturn>().toMatchTypeOf<UseAssetActionsReturn>();
    expectTypeOf<ViewModeState>().toMatchTypeOf<ViewModeState>();
  });
});
