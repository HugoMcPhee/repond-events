import { chainEffects } from "./effects/chains";
import { liveEventEffects, liveEventParamEffects } from "./effects/liveEvents";
import { chainsStore } from "./stores/chains";
import { liveEventsStore } from "./stores/liveEvents";

export {
  todo,
  todo as II, // as an easy-to-read alias for todo
  todo as E, // as an easy-to-read alias for todo (Event)
  getChainState,
  getLiveEventState,
  setLiveEventState,
  setChainState,
  runEvent,
  runPriorityEvent,
  runEvents,
  addSubEvents,
  runPriorityEvents,
  eventDo,
  chainDo,
  chainWithEventDo,
  allGroupEventsDo,
  doForAllBeforeEvent,
  skipToEvent,
  cancelUpToEvent,
  allEventsDo,
  MakeEventType,
  makeEventTypes,
  initEventTypeGroups,
  makeValueTypes,
  initValueTypeGroups,
  makeValue,
  makeValue as I_, // as an easy-to-read alias for makeValue
  makeValue as V, // as an easy-to-read alias for makeValue
} from "./helpers";
export { basicValues } from "./events/values/basic";
export { basicEvents } from "./events/basic";

export type {
  ChainId,
  EventBlockBase,
  EventBlock,
  EventBlockOptions,
  EventRunLiveInfo,
  RunModeExtraOptions,
  RunModeOptions,
  KnownChainId,
  RunMode,
  EventGroupName,
  EventName,
  EventTypeDefinition,
  EventBlockTuple,
  EventBlockTuple as EventTuple,
  EventBlockTupleLoose,
  EventParams,
  CustomValueParams,
  DefaultValueParams,
} from "./types";

export const repondEventsStores = {
  liveEventsStore,
  chainsStore,
};

export const repondEventsEffectGroups = {
  chainEffects,
  liveEventEffects,
};

export const repondEventsParamEffectGroups = {
  liveEventParamEffects,
};
