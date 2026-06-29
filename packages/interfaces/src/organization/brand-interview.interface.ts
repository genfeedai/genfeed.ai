/**
 * Brand context interview — shared shapes for the deterministic interview engine
 * and its three driver surfaces (in-app agent, MCP, settings stepper).
 */

export type BrandInterviewGroup = 'identity' | 'voice' | 'strategy';

export type BrandInterviewAnswerType = 'text' | 'list' | 'enum';

export type BrandInterviewStatus = 'in_progress' | 'completed' | 'abandoned';

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

export interface IBrandInterviewStartResult {
  interviewId: string;
  brandId: string;
  status: BrandInterviewStatus;
  currentQuestion: IBrandInterviewQuestion | null;
  progress: IBrandInterviewProgress;
  completenessScore: number;
  creditsCharged: number;
}

export interface IBrandInterviewAnswerResult {
  interviewId: string;
  status: BrandInterviewStatus;
  isComplete: boolean;
  nextQuestion: IBrandInterviewQuestion | null;
  progress: IBrandInterviewProgress;
  completenessScore: number;
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
  status: BrandInterviewStatus;
  currentQuestion: IBrandInterviewQuestion | null;
  completenessScore: number;
  answeredCount: number;
  totalCount: number;
}
