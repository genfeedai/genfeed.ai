import { type ModelOutputCapability } from '@genfeedai/constants';
import type { IModel } from '@genfeedai/interfaces';
/**
 * Build a ModelOutputCapability from DB fields on the IModel document.
 * Returns null if the model has no capability fields populated (maxOutputs is undefined).
 */
export declare function getModelCapabilityFromDoc(model: IModel): ModelOutputCapability | null;
/**
 * Get capability from DB fields first, falling back to the static constant.
 */
export declare function getModelCapability(model: IModel): ModelOutputCapability | null;
/**
 * Get capability by model key string. If an IModel document is provided,
 * uses DB fields with constant fallback. Otherwise looks up the static constant only.
 */
export declare function getModelCapabilityByKey(modelKey: string, model?: IModel): ModelOutputCapability | null;
//# sourceMappingURL=model-capability.helper.d.ts.map