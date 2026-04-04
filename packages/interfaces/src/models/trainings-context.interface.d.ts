export interface ITrainingsContextType {
    refreshTrainings: (() => void) | null;
    isRefreshing: boolean;
    setRefreshTrainings: (fn: (() => Promise<void>) | null) => void;
}
//# sourceMappingURL=trainings-context.interface.d.ts.map