import { assetAttributes } from '@serializers/attributes/ingredients/asset.attributes';
import { simpleConfig } from '@serializers/builders';

export const assetSerializerConfig = simpleConfig('asset', assetAttributes);
