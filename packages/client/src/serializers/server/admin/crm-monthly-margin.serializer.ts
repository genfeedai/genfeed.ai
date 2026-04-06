import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { crmMonthlyMarginSerializerConfig } from '../../configs';

export const CrmMonthlyMarginSerializer: BuiltSerializer =
  buildSingleSerializer('server', crmMonthlyMarginSerializerConfig);
