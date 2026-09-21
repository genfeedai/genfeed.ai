/**
 * Brand context interview — shared shapes for the deterministic interview engine
 * and its three driver surfaces (in-app agent, MCP, settings stepper).
 */
import type { BrandInterviewStatus } from '../..';
import type { IExpertPositioningScore } from '../ai/expert-positioning.interface';

export type BrandInterviewGroup = 'identity' | 'voice' | 'strategy' | 'expert';

export type BrandInterviewAnswerType = 'text' | 'list' | 'enum';

export interface IBrandInterviewQuestion {
  fieldKey: string;
  group: BrandInterviewGroup;
  weight: number;
  questionText: string;
  hint?: string;
  answerType: BrandInterviewAnswerType;
  enumOptions?: string[];
  examples?: string[];
  isRequired: boolean;
}

export interface IBrandInterviewProgress {
  totalFields: number;
  answeredFields: number;
  percentComplete: number;
}

/** Session step row for the secondary interview navigator. */
export type BrandInterviewStepStatus =
  | 'answered'
  | 'current'
  | 'skipped'
  | 'upcoming';

export interface IBrandInterviewStep {
  fieldKey: string;
  group: BrandInterviewGroup;
  /** Short label for the steps rail (truncated question text). */
  label: string;
  status: BrandInterviewStepStatus;
  /** True when the user can jump back to this step (answered or current). */
  isNavigable: boolean;
  /** Full question payload so the main form can reopen any navigable step. */
  question: IBrandInterviewQuestion;
  /** Short answer preview for answered steps. */
  answerPreview?: string;
}

export type BrandInterviewAnswerValue = string | string[];

export interface IBrandInterviewStartResult {
  interviewId: string;
  brandId: string;
  /** True when the session includes the Expert Path positioning section. */
  isExpertPositioning: boolean;
  status: BrandInterviewStatus;
  currentQuestion: IBrandInterviewQuestion | null;
  progress: IBrandInterviewProgress;
  completenessScore: number;
  creditsCharged: number;
  steps: IBrandInterviewStep[];
  answeredFields: Record<string, BrandInterviewAnswerValue>;
}

export interface IBrandInterviewAnswerResult {
  interviewId: string;
  status: BrandInterviewStatus;
  isComplete: boolean;
  nextQuestion: IBrandInterviewQuestion | null;
  progress: IBrandInterviewProgress;
  completenessScore: number;
  steps: IBrandInterviewStep[];
  answeredFields: Record<string, BrandInterviewAnswerValue>;
  /**
   * Set when this answer completed an Expert Path session: the positioning
   * scorecard of the harness profile draft generated from the answers.
   */
  positioningScore?: IExpertPositioningScore;
}

export interface IBrandInterviewCompleteness {
  overallScore: number;
  interviewableGapCount: number;
  incompleteFieldKeys: string[];
}

/**
 * Mapped shape returned by GET /brands/:brandId/interview/active.
 * Derived from the raw Prisma BrandInterview row — currentFieldKey is resolved
 * to a full IBrandInterviewQuestion and completenessBefore is surfaced as
 * completenessScore so the resume hook gets a consistent contract.
 */
export interface IActiveBrandInterview {
  id: string;
  brandId: string;
  isExpertPositioning: boolean;
  status: BrandInterviewStatus;
  currentQuestion: IBrandInterviewQuestion | null;
  completenessScore: number;
  answeredCount: number;
  totalCount: number;
  steps: IBrandInterviewStep[];
  answeredFields: Record<string, BrandInterviewAnswerValue>;
}
