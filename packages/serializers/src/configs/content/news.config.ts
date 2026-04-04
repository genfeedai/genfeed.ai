import { newsAttributes } from '@serializers/attributes/content/news.attributes';
import { simpleConfig } from '@serializers/builders';

export const newsSerializerConfig = simpleConfig('news', newsAttributes);
