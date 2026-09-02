export interface IFanvueChatbotChatStyle {
  opening: string;
  flirty: string;
  deflect_explicit: string;
  upsell: string;
}

export interface IFanvueChatbotPersona {
  name: string;
  age: number;
  personality: string;
  tone: string;
  backstory: string;
  interests: string[];
  contentThemes: string[];
  boundaries: string[];
  ppvTriggers: string[];
  chatStyle: IFanvueChatbotChatStyle;
  customInstructions: string;
}
