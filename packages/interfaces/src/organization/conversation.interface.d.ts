import type { IBaseEntity, IBrand, IOrganization, IUser } from '../index';
export interface IConversation extends IBaseEntity {
    organization: IOrganization;
    brand?: IBrand;
    user: IUser;
    title?: string;
    platform?: string;
    status: string;
}
export interface IConversationMessageMetadata {
    generatedContent?: string;
    contentType?: string;
    platform?: string;
    mediaUrl?: string;
    isInserted?: boolean;
}
export interface IConversationMessage extends IBaseEntity {
    conversation: IConversation;
    organization: IOrganization;
    user: IUser;
    role: string;
    content: string;
    metadata?: IConversationMessageMetadata;
}
//# sourceMappingURL=conversation.interface.d.ts.map