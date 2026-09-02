export enum BotCommandType {
  PROMPT_IMAGE = 'prompt-image',
  PROMPT_VIDEO = 'prompt-video',
  SET_BRAND = 'set-brand',
  STATUS = 'status',
}

export enum BotInteractionType {
  PING = 1,
  APPLICATION_COMMAND = 2,
  MESSAGE_COMPONENT = 3,
  APPLICATION_COMMAND_AUTOCOMPLETE = 4,
  MODAL_SUBMIT = 5,
}

export enum BotResponseType {
  PONG = 1,
  CHANNEL_MESSAGE = 4,
  DEFERRED_CHANNEL_MESSAGE = 5,
  DEFERRED_UPDATE_MESSAGE = 6,
  UPDATE_MESSAGE = 7,
  APPLICATION_COMMAND_AUTOCOMPLETE_RESULT = 8,
  MODAL = 9,
}
