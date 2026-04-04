import { type ModelOutputCapability } from '@genfeedai/constants';
import { type ModelKey } from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';
export declare function getDefaultAspectRatio(modelKey: ModelKey | string, capability?: ModelOutputCapability | null): string;
export declare function getAspectRatiosForModel(modelKey: ModelKey | string, capability?: ModelOutputCapability | null): readonly string[];
export declare function normalizeAspectRatioForModel(modelKey: ModelKey | string, aspectRatio: string, capability?: ModelOutputCapability | null): string;
export declare function calculateAspectRatio(width?: number, height?: number): string;
export declare function isAspectRatioSupported(modelKey: ModelKey | string, aspectRatio: string, capability?: ModelOutputCapability | null): boolean;
export declare function convertRatioToOrientation(ratio: string): 'portrait' | 'landscape';
/** Get default aspect ratio from an IModel document (DB-backed with constant fallback). */
export declare function getDefaultAspectRatioFromModel(model: IModel): string;
/** Get available aspect ratios from an IModel document. */
export declare function getAspectRatiosFromModel(model: IModel): readonly string[];
/** Normalize an aspect ratio for an IModel document. */
export declare function normalizeAspectRatioFromModel(model: IModel, aspectRatio: string): string;
/** Check if an aspect ratio is supported by an IModel document. */
export declare function isAspectRatioSupportedFromModel(model: IModel, aspectRatio: string): boolean;
//# sourceMappingURL=aspect-ratio.helper.d.ts.map