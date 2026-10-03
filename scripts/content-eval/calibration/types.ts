import type {
  CallProvenance,
  DispatcherKind,
  EvalDispatcher,
  EvalSpendLedger,
  FixtureRow,
  ScoredRow,
  SuiteContext,
  ThresholdCheck,
} from '../contracts';
import type { SpendCapExceededError } from '../spend';
import type {
  ArmScore,
  ArmSpec,
  BrandContextFile,
  CalibrationSection,
  ProductionProfileId,
  ScoringSurface,
  SkippedCrossFamily,
  TextSurfaceValues,
  VisionSurfaceValues,
} from './contracts';

export type Band = 0 | 1 | 2 | 3;
export type KappaWeighting = 'quadratic' | 'unweighted';

export interface JudgeScale {
  approveAt: number;
  bandCuts: readonly [number, number, number];
  max: number;
  min: number;
}

export interface ProductionProfile {
  defaultModel: string;
  id: ProductionProfileId;
  scale: JudgeScale;
}

export interface CalibrationPlan {
  brandContext: BrandContextFile | null;
  crossFamilyModels: string[]; // flag order, duplicate-free
  productionProfiles: ProductionProfileId[]; // flag order, duplicate-free, non-empty
  scoringSurface: ScoringSurface;
}

export interface JudgeSuitePlan {
  arms: ArmSpec[];
  calibration: CalibrationPlan;
  skippedCrossFamily: SkippedCrossFamily[];
}

export interface JudgeSuiteFlags {
  brandContextPath: string | null;
  crossFamilyModels: string[];
  productionProfiles: ProductionProfileId[];
}

export interface ArmCallResult {
  brandScore: number | null;
  callId: string | null;
  failure: string | null;
  nativeScore: number | null;
}

export interface EvaluationsScoreInput {
  model: string;
  output: string;
  row: FixtureRow;
}

export interface EvaluationsScorerPort {
  close(): Promise<void>;
  score(input: EvaluationsScoreInput): Promise<ArmCallResult>;
}

export interface EvaluationsScorerOptions {
  dispatcher: EvalDispatcher;
  ledger: EvalSpendLedger;
  seed: number;
}

/** Stands in for ReplicateService inside the live Nest context. */
export interface EvaluationsCompletionBridge {
  activeModel: string | null;
  activeRowId: string | null;
  generateTextCompletionSync(
    modelIdentifier: string,
    input: Record<string, unknown>,
    apiKeyOverride?: string,
  ): Promise<string>;
  lastCallId: string | null;
  lastFatal: SpendCapExceededError | null;
  reset(): void; // sets lastCallId and lastFatal to null
}

export interface ContentQualityArmInput {
  context: SuiteContext;
  harnessCriteria: string | null; // non-null selects rubricVersion 'content-quality-scorer+criteria'
  model: string;
  output: string;
  row: FixtureRow;
}

export interface GoldenPair {
  approveRow: FixtureRow;
  contentKind: string;
  rejectRow: FixtureRow;
}

export interface PairJudgement {
  approveFirstPreferred: boolean | null;
  contentKind: string;
  judgeRegistryKey: string;
  rejectFirstPreferred: boolean | null;
}

export interface CalibrationAnalysisInput {
  arms: ArmSpec[];
  calls: CallProvenance[];
  harnessJudgeKeys: string[];
  pairJudgements: PairJudgement[];
  plan: CalibrationPlan;
  rows: FixtureRow[];
  scores: ArmScore[];
  skippedCrossFamily: SkippedCrossFamily[];
}

export interface CalibrationAnalysis {
  section: CalibrationSection;
  thresholdChecks: ThresholdCheck[];
}

export interface SurfaceFileContent {
  content: string;
  path: string;
}

export interface ScoringSurfaceInput {
  textFiles: SurfaceFileContent[];
  textValues: TextSurfaceValues;
  visionFiles: SurfaceFileContent[];
  visionValues: VisionSurfaceValues;
}

export interface QuoteModelLine {
  calls: number;
  capUsd: number;
  expectedUsd: number;
  model: string;
  promptTokens: number;
}

export interface CalibrationQuote {
  capUsd: number;
  evaluationsPromptAllowance: number;
  expectedUsd: number;
  models: QuoteModelLine[]; // sorted by model, code point
  perRowExpectedUsd: number | null;
  recommendedMaxCredits: number;
  reportRunId: string;
  rowCount: number;
}

export type ArmScoringInput = {
  dispatcherKind: DispatcherKind;
  harnessJudgeKeys: string[];
  plan: CalibrationPlan;
};
export type HarnessScoredRow = ScoredRow;
