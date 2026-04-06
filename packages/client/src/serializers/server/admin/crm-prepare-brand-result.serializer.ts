import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { crmPrepareBrandResultSerializerConfig } from '../../configs';

export const CrmPrepareBrandResultSerializer: BuiltSerializer =
  buildSingleSerializer('server', crmPrepareBrandResultSerializerConfig);
