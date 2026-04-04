/**
 * Mock for @genfeedai/client/serializers
 * Prevents the real serializers from building (which requires complex config)
 * during unit tests. Services that use serializers should have them mocked here.
 */
const noop = {};

export const PostSerializer = noop;
export const ArticleSerializer = noop;
export const AssetSerializer = noop;
export const CaptionSerializer = noop;
export const FolderSerializer = noop;
export const PromptSerializer = noop;
export const TagSerializer = noop;
export const TemplateSerializer = noop;
export const TranscriptSerializer = noop;
export const BookmarkSerializer = noop;
export const LinkSerializer = noop;
export const NewsSerializer = noop;
export const PresignedUploadSerializer = noop;
export const PostAnalyticsSerializer = noop;
export const EvaluationSerializer = noop;
export const TrainingSerializer = noop;
export const WatchlistSerializer = noop;
export const VoteSerializer = noop;
export const TrendSerializer = noop;
export const ActivitySerializer = noop;
export const BrandSerializer = noop;
export const OrganizationSerializer = noop;
export const MemberSerializer = noop;
export const UserSerializer = noop;
export const RoleSerializer = noop;
export const CredentialSerializer = noop;
export const SubscriptionSerializer = noop;
export const StyleSerializer = noop;
export const SceneSerializer = noop;
export const MoodSerializer = noop;
export const LensSerializer = noop;
export const LightingSerializer = noop;
export const SoundSerializer = noop;
export const CameraSerializer = noop;
export const CameraMovementSerializer = noop;
export const PresetSerializer = noop;
export const FontFamilySerializer = noop;
export const BlacklistSerializer = noop;
export const MonitoredAccountSerializer = noop;
export const ScheduleSerializer = noop;
export const WorkflowSerializer = noop;
export const BotSerializer = noop;
export const ReplyBotConfigSerializer = noop;
export const BotActivitySerializer = noop;
export const VideoSerializer = noop;
export const ImageSerializer = noop;
export const MusicSerializer = noop;
export const VoiceSerializer = noop;
export const AvatarSerializer = noop;
export const GIFSerializer = noop;
export const HeyGenSerializer = noop;
export const IngredientSerializer = noop;
export const ModelSerializer = noop;
export const OutreachCampaignSerializer = noop;
export const CampaignSerializer = noop;
export const LinkSerializer2 = noop;
