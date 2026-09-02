import { serializeCollection } from '@api/helpers/utils/response/response.util';
import type { ListeningAnalysisResult } from '@genfeedai/contracts/interfaces';
import {
  ListeningSignalSerializer,
  ListeningThemeSerializer,
} from '@genfeedai/serializers';
import type { Request } from 'express';

export function serializeListeningAnalysis(
  request: Request,
  result: ListeningAnalysisResult,
) {
  const { signals, themes, ...summary } = result;
  return {
    ...summary,
    signals: serializeCollection(request, ListeningSignalSerializer, {
      docs: signals,
    }),
    themes: serializeCollection(request, ListeningThemeSerializer, {
      docs: themes,
    }),
  };
}
