import type { ModelKey } from '@genfeedai/enums';
export declare function formatDuration(seconds?: number | null): string;
export declare class DurationUtil {
    static validateAndNormalize(requestedDuration: number | undefined, allowedDurations: number[], defaultDuration?: number): number;
    static validateSoraDuration(requestedDuration?: number): number;
    static validateVeoDuration(requestedDuration?: number, allowedDurations?: number[], defaultDuration?: number): number;
    static validateDurationForModel(model: ModelKey, requestedDuration?: number): number;
}
//# sourceMappingURL=video-duration.helper.d.ts.map