type ModelData = Record<string, unknown>;

function assignModelData(instance: object, data?: ModelData) {
  Object.assign(instance, data);
}

function createModelClass() {
  return class {
    constructor(data?: ModelData) {
      assignModelData(this, data);
    }
  };
}

export type NewsletterStatus = string;

export interface NewsletterSourceRef {
  id: string;
  title?: string;
  url?: string;
}

export const Activity = createModelClass();
export const Article = createModelClass();
export const Asset = createModelClass();
export const Authentication = createModelClass();
export const BaseCredential = createModelClass();
export const BaseCredentialInstagram = createModelClass();
export const BaseCredentialOAuth = createModelClass();
export const BaseEntity = createModelClass();
export const Blacklist = createModelClass();
export const Bot = createModelClass();
export const BotActivity = createModelClass();
export const Brand = createModelClass();
export const Camera = createModelClass();
export const CameraMovement = createModelClass();
export const Caption = createModelClass();
export const Credit = createModelClass();
export const Evaluation = createModelClass();
export const Folder = createModelClass();
export const FontFamily = createModelClass();
export const HeyGen = createModelClass();
export const HeyGenAvatar = createModelClass();
export const HeyGenVoice = createModelClass();
export const Ingredient = createModelClass();
export const Lens = createModelClass();
export const Lighting = createModelClass();
export const Link = createModelClass();
export const Member = createModelClass();
export const Metadata = createModelClass();
export const Model = createModelClass();
export const MonitoredAccount = createModelClass();
export const Mood = createModelClass();
export const News = createModelClass();
export const Organization = createModelClass();
export const OrganizationSetting = createModelClass();
export const Post = createModelClass();
export const Preset = createModelClass();
export const Prompt = createModelClass();
export const PromptTemplate = createModelClass();
export const ReplyBotConfig = createModelClass();
export const Role = createModelClass();
export const Scene = createModelClass();
export const Setting = createModelClass();
export const StripePrice = createModelClass();
export const StripeUrl = createModelClass();
export const Style = createModelClass();
export const Subscription = createModelClass();
export const Tag = createModelClass();
export const Training = createModelClass();
export const Trend = createModelClass();
export const User = createModelClass();
export const Vote = createModelClass();
export const Workflow = createModelClass();
