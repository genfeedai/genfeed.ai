"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DurationUtil = void 0;
exports.formatDuration = formatDuration;
const constants_1 = require("@genfeedai/constants");
function formatDuration(seconds) {
    if (!seconds) {
        return '0:00';
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const paddedMinutes = minutes.toString().padStart(2, '0');
    const paddedSecs = secs.toString().padStart(2, '0');
    if (hours > 0) {
        return `${hours}:${paddedMinutes}:${paddedSecs}`;
    }
    return `${minutes}:${paddedSecs}`;
}
class DurationUtil {
    static validateAndNormalize(requestedDuration, allowedDurations, defaultDuration) {
        if (!requestedDuration) {
            return defaultDuration ?? allowedDurations[0];
        }
        if (allowedDurations.includes(requestedDuration)) {
            return requestedDuration;
        }
        return allowedDurations.reduce((prev, curr) => Math.abs(curr - requestedDuration) < Math.abs(prev - requestedDuration)
            ? curr
            : prev);
    }
    static validateSoraDuration(requestedDuration) {
        return DurationUtil.validateAndNormalize(requestedDuration, [4, 8, 12], 4);
    }
    static validateVeoDuration(requestedDuration, allowedDurations = [5, 8], defaultDuration = 8) {
        return DurationUtil.validateAndNormalize(requestedDuration, allowedDurations, defaultDuration);
    }
    static validateDurationForModel(model, requestedDuration) {
        const allowedDurations = (0, constants_1.getModelDurations)(model);
        const defaultDuration = (0, constants_1.getModelDefaultDuration)(model);
        if (allowedDurations.length === 0) {
            return requestedDuration || defaultDuration || 8;
        }
        return DurationUtil.validateAndNormalize(requestedDuration, [...allowedDurations], defaultDuration);
    }
}
exports.DurationUtil = DurationUtil;
//# sourceMappingURL=video-duration.helper.js.map