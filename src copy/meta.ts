import { StatePath } from "repond";
import { ChainId } from "./types";

export const repondEventsMeta = {
  // Events
  defaultElapsedTimePath: null as null | StatePath<any>,
  allEventTypeGroups: {} as Record<string, Record<string, any>>,
  defaultChainId: null as null | ChainId,
  emojiKeys: {} as Record<string, string>,
  // Values
  allValueTypeGroups: {} as Record<string, Record<string, any>>,
  valueEmojiKeys: {} as Record<string, string>,
};
