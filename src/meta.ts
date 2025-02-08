import { StatePath } from "repond";
import { ChainId } from "./types";

type FastChainInfoMapItem = {
  nowChildFastChainId?: ChainId;
  isCanceled: boolean;
  parentFastChainId?: ChainId;
  variablesMap: Record<string, any>;
};

export const repondEventsMeta = {
  // Events
  defaultElapsedTimePath: null as null | StatePath<any>,
  allEventTypeGroups: {} as Record<string, Record<string, any>>,
  defaultChainId: null as null | ChainId,
  emojiKeys: {} as Record<string, string>,
  // Values
  allValueTypeGroups: {} as Record<string, Record<string, any>>,
  valueEmojiKeys: {} as Record<string, string>,
  // Variables
  variablesByScopesMap: {} as Record<string, Record<string, any>>,
  // Fast chains
  fastChain: {
    nowRootFastChainId: undefined as undefined | ChainId,
    nowRootFastChainParentId: undefined as undefined | ChainId,
    nowFastChainsInfoMap: {} as Record<ChainId, FastChainInfoMapItem>,
    nowDescendantFastChainId: {} as Record<ChainId, ChainId[]>,
    foundFastReturnValue: undefined as any,
    getEventValueChainId: undefined as undefined | ChainId,
  },
  // getEventValue
  resolveValueMap: {}, // Record<ValueId, Resolve function>
};
