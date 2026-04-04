import {
  articleSerializerConfig,
  type BuiltSerializer,
  bookmarkSerializerConfig,
  buildSingleSerializer,
  linkSerializerConfig,
  newsletterSerializerConfig,
  newsSerializerConfig,
  postAnalyticsSerializerConfig,
  postSerializerConfig,
  presignedUploadSerializerConfig,
  templateSerializerConfig,
  transcriptSerializerConfig,
} from '..';

// Build all content serializers
export const ArticleSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  articleSerializerConfig,
);
export const BookmarkSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  bookmarkSerializerConfig,
);
export const LinkSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  linkSerializerConfig,
);
export const NewsSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  newsSerializerConfig,
);
export const NewsletterSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  newsletterSerializerConfig,
);
export const PostSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  postSerializerConfig,
);
export const PostAnalyticsSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  postAnalyticsSerializerConfig,
);
export const PresignedUploadSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  presignedUploadSerializerConfig,
);
export const TemplateSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  templateSerializerConfig,
);
export const TranscriptSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  transcriptSerializerConfig,
);
