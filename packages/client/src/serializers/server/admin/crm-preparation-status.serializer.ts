import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { crmPreparationStatusSerializerConfig } from '../../configs';

export const CrmPreparationStatusSerializer: BuiltSerializer =
  buildSingleSerializer('server', crmPreparationStatusSerializerConfig);
