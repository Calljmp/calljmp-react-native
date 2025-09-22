import { Message } from '../common';

export const DefaultTextGenerationModel =
  '@cf/meta/llama-3.1-8b-instruct-fast' as const;

interface BaseTextStreamEvent {
  type: 'message';
}

export interface TextMessageEvent extends BaseTextStreamEvent, Message {
  type: 'message';
}

export type TextStreamEvent = TextMessageEvent;
