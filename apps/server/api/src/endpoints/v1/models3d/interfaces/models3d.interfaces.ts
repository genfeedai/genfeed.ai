import type { Request } from 'express';

interface Models3dRequestUser {
  id?: string;
  brandId?: string;
  isApiKey?: boolean;
  organizationId?: string;
  scopes?: string[];
  userId?: string;
}

export type Models3dAuthenticatedRequest = Omit<Request, 'user'> & {
  user?: Models3dRequestUser;
};

export type Models3dStatus =
  | 'sheet_pending'
  | 'sheet_ready'
  | 'building'
  | 'ready'
  | 'failed';

export interface Models3dResponse {
  id: string;
  status: Models3dStatus;
  /** Credits held for the steps this render has paid for so far. */
  credits: { build: number | null; sheet: number };
  error?: string;
  /** Signed URL of the angle sheet, once rendered. */
  sheetUrl?: string;
  /** Ingredient id of the GLB, once a build has started. */
  modelIngredientId?: string;
  /** Signed URL of the GLB, once ready. */
  glbUrl?: string;
}

/** Source and prompt of a render, kept on the sheet ingredient. */
export interface Models3dProviderData {
  models3d: {
    /** Credits frozen for the step this ingredient produces. */
    credits?: number;
    prompt?: string;
    sourceImageUrl?: string;
    sourceS3Key?: string;
  };
}

export interface Models3dQuote {
  build: number;
  sheet: number;
  total: number;
}
