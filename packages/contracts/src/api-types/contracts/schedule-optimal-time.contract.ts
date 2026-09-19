/**
 * Schema-enforced shape of the optimal-posting-time recommendation (#4873).
 *
 * Times are ISO-8601 instants the scheduler turns into slots, so an answer in
 * prose ("next Tuesday morning") has to fail rather than be stored as a
 * timestamp string nothing can parse.
 */

import { z } from 'zod';

export const scheduleOptimalTimeSchema = z.object({
  alternativeTimes: z.array(z.iso.datetime({ offset: true })),
  confidence: z.number().min(0).max(100),
  expectedPerformance: z.object({
    estimatedEngagement: z.number().min(0),
    estimatedReach: z.number().min(0),
  }),
  reasoning: z.array(z.string()),
  recommendedTime: z.iso.datetime({ offset: true }),
});

export type ScheduleOptimalTime = z.infer<typeof scheduleOptimalTimeSchema>;

export const SCHEDULE_OPTIMAL_TIME_SCHEMA_NAME = 'schedule_optimal_time';
