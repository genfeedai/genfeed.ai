export interface IFanvueWebhookMessage {
  uuid: string;
  text: string;
}

export interface IFanvueWebhookSender {
  uuid: string;
  handle: string;
  displayName: string;
}

export interface IFanvueWebhookPayload {
  message: IFanvueWebhookMessage;
  sender: IFanvueWebhookSender;
  recipientUuid: string;
  messageUuid: string;
}
