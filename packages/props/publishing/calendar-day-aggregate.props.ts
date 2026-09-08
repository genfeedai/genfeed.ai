export type CalendarDayAggregate = {
  dayKey: string;
  filledCount: number;
  instant: string;
  missingCount: number;
  missingIdentityKeys: string[];
};

export type CalendarDensitySource = {
  identityKey?: string;
  instant: string;
  kind: 'filled' | 'missing';
};
