export interface IWhatsappMessageResponse {
  sid: string;
  status: string;
  dateCreated: string;
  dateSent: string | null;
  dateUpdated: string;
  direction: string;
  from: string;
  to: string;
  body: string;
  numMedia: string;
  numSegments: string;
  price: string | null;
  priceUnit: string;
  uri: string;
  errorCode: number | null;
  errorMessage: string | null;
}

export interface IWhatsappSendMessageParams {
  to: string;
  body: string;
  mediaUrl?: string;
}

export interface IWhatsappSendTemplateParams {
  to: string;
  templateSid: string;
  variables?: Record<string, string>;
}

export interface IWhatsappMessageStatusResponse {
  sid: string;
  status: string;
  dateCreated: string;
  dateSent: string | null;
  dateUpdated: string;
  errorCode: number | null;
  errorMessage: string | null;
}
