import { forEach } from "chootils/dist/loops";
import { AllState, ItemState, ItemType, StatePath, getState, onNextTick, setState } from "repond";
import {
  _addEvent,
  _addEvents,
  _getStatesToRunEventsInMode,
  _makeLiveIdFromEventInstance,
  eventNodeToEventInstance,
  eventTuplesToEventInstances,
  getChainIdFromLiveEventId,
  getLiveEventsIdsUpToLiveEventId,
  getLiveIdsForGroup,
  makeNewChainId,
} from "./internal";
import { repondEventsMeta } from "./meta";
import {
  ChainId,
  DefaultEventParams,
  EmojiKeys,
  EventGroupName,
  EventInstanceOptions,
  EventName,
  EventParams,
  EventTuple,
  EventTypeDefinition,
  MakeOptionalWhereUndefined,
  RunMode,
  RunModeExtraOptions,
  TypeOrUndefinedIfAllOptional,
} from "./types";
import { UnsetEmojiKeysType } from "./declarations";

// ---------------------------------------------
// Utils

type OptionalIfUndefinableSpreadType<T extends any> = T extends undefined
  ? [T?, EventInstanceOptions?]
  : [T, EventInstanceOptions?];

type ExcludedOriginalKeys = {
  [K in keyof EmojiKeys]: EmojiKeys[K];
}[keyof EmojiKeys];

type AcceptableKeys = Exclude<EventGroupName, ExcludedOriginalKeys> | keyof EmojiKeys;

type ResolveGroupType<T_Key extends AcceptableKeys> = EmojiKeys extends UnsetEmojiKeysType
  ? T_Key
  : T_Key extends keyof EmojiKeys
  ? EmojiKeys[T_Key]
  : T_Key;

// Returns an event instance typle, useful to get a typed event with auto-completion
// meant to use with runEvents like runEvents([run("group", "name", params), run("group", "name", params)])
export function todo<
  T_Key extends AcceptableKeys,
  // T_Group extends T_Key extends keyof EmojiKeys ? EmojiKeys[T_Key] : T_Key,
  T_Group extends ResolveGroupType<T_Key>,
  T_Name extends EventName<T_Group>,
  T_GenericParamA
>(
  groupOrEmoji: T_Key,
  name: T_Name,
  ...args: OptionalIfUndefinableSpreadType<TypeOrUndefinedIfAllOptional<EventParams<T_Group, T_Name, T_GenericParamA>>>
) {
  const group =
    groupOrEmoji in repondEventsMeta.emojiKeys
      ? repondEventsMeta.emojiKeys[groupOrEmoji as keyof EmojiKeys]
      : groupOrEmoji;
  // ...params: OptionalIfUndefinableSpreadType<
  //   TypeOrUndefinedIfAllOptional<EventParams<T_Group, T_Name, T_GenericParamA>>
  // >,
  // options?: EventInstanceOptions
  // Destructure args to get params and options
  let params = args[0]; // This would be your number or undefined
  let options = args[1]; // This would be your EventInstanceOptions or undefined

  const eventTuple: EventTuple = [group, name, params ?? {}, options] as EventTuple;

  return eventTuple;
}

export function getChainState(chainId: ChainId) {
  return getState().chains[chainId];
}

export function getLiveEventState(liveEventId: string) {
  return getState().liveEvents[liveEventId];
}

export function setLiveEventState(liveEventId: string, state: Partial<ItemState<"liveEvents">>) {
  setState({ liveEvents: { [liveEventId]: state } });
}

export function setChainState(chainId: ChainId, state: Partial<ItemState<"chains">>) {
  setState({ chains: { [chainId]: state } });
}

// ---------------------------------------------
// Events and chains

// NOTE most of the helper functions
//   - Run inside set state - to read the latest state if setStates were run before this
//   - Run inside onNextTick - to run after the current setStates and effects, to run at the start of the next frame

export function runEvent<
  T_Key extends AcceptableKeys,
  // T_Group extends T_Key extends keyof EmojiKeys ? EmojiKeys[T_Key] : T_Key,
  T_Group extends ResolveGroupType<T_Key>,
  T_Name extends EventName<T_Group>,
  T_GenericParamA
>(
  groupOrEmoji: T_Key,
  name: T_Name,
  ...args: OptionalIfUndefinableSpreadType<TypeOrUndefinedIfAllOptional<EventParams<T_Group, T_Name, T_GenericParamA>>>
) {
  const group =
    groupOrEmoji in repondEventsMeta.emojiKeys
      ? repondEventsMeta.emojiKeys[groupOrEmoji as keyof EmojiKeys]
      : groupOrEmoji;

  // Destructure args to get params and options
  let params = args[0]; // This would be your number or undefined
  let options = args[1]; // This would be your EventInstanceOptions or undefined

  const eventInstance = eventNodeToEventInstance({ group, name, params: params ?? {} }, options);
  // generate the same chainId that would be generated if the event was added, but it's needed to get the liveId
  // NOTE in _addEvents, a liveId given means its the parent liveId for subEvents, meaning the chainId will be the same as the parent liveId,
  // but since this function only adds one event, the chainId will be different from the liveId
  const chainId = options?.chainId ?? repondEventsMeta.defaultChainId ?? makeNewChainId();
  eventInstance.options.chainId = chainId;
  const liveId = options?.liveId ?? _makeLiveIdFromEventInstance(eventInstance);
  const realLiveId = _addEvent({ group, name, params: params ?? {} }, { ...options, liveId, chainId });

  return realLiveId;
}

export function runPriorityEvent<T_Group extends EventGroupName, T_Name extends EventName<T_Group>, T_GenericParamA>(
  group: T_Group,
  name: T_Name,
  params: EventParams<T_Group, T_Name, T_GenericParamA>,
  options: EventInstanceOptions
) {
  // NOTE _addEvent runs _addEvents which has onNextTick inside
  const chainId = _addEvent({ group, name, params: params ?? {} }, { hasPriority: true, ...options });
  return chainId;
}

export function runEvents<T_Events extends EventTuple[]>(eventsToRun: T_Events, options?: EventInstanceOptions) {
  // NOTE _addEvents has onNextTick inside

  // NOTE adding a liveId will make the chain a subChain of the liveEvent
  const chainId = _addEvents(eventTuplesToEventInstances(eventsToRun), { ...options });
  return chainId;
}

export function addSubEvents<T_Events extends EventTuple[]>(
  liveId: string,
  eventsToRun: T_Events,
  options?: EventInstanceOptions
) {
  runEvents(eventsToRun, { liveId, ...options });
}

export function runPriorityEvents<T_Events extends EventTuple[]>(
  eventsToRun: T_Events,
  options?: EventInstanceOptions
) {
  // NOTE runEvents runs _addEvents which has onNextTick inside
  return runEvents(eventsToRun, { hasPriority: true, ...options });
}

export function eventDo(runMode: RunMode, liveId: string, runOptions?: RunModeExtraOptions) {
  onNextTick(() => {
    setState((state) => _getStatesToRunEventsInMode({ state, runMode, targetLiveIds: [liveId], runOptions }));
  });
}

export function chainDo(runMode: RunMode, chainId: ChainId, runOptions?: RunModeExtraOptions) {
  onNextTick(() => {
    setState((state) => _getStatesToRunEventsInMode({ state, runMode, chainId, runOptions }));
  });
}

export function chainWithEventDo(runMode: RunMode, liveId: string, runOptions?: RunModeExtraOptions) {
  setState((state) => {
    const chainId = getChainIdFromLiveEventId(state, liveId);
    // `no chain found for ${liveId}`
    if (!chainId) return undefined;
    return _getStatesToRunEventsInMode({ state, runMode, chainId, runOptions });
  });
}

export function allGroupEventsDo(groupName: string, runMode: RunMode, runOptions?: RunModeExtraOptions) {
  onNextTick(() => {
    setState((state) => {
      const targetLiveIds = getLiveIdsForGroup(state, groupName);
      return _getStatesToRunEventsInMode({ state, runMode, targetLiveIds, runOptions });
    });
  });
}

export function doForAllBeforeEvent(runMode: RunMode, liveId: string, runOptions?: RunModeExtraOptions) {
  onNextTick(() => {
    setState((state) => {
      const targetLiveIds = getLiveEventsIdsUpToLiveEventId(state, liveId);
      return _getStatesToRunEventsInMode({ state, runMode, targetLiveIds, runOptions });
    });
  });
}

export function skipToEvent(liveId: string, runOptions?: RunModeExtraOptions) {
  doForAllBeforeEvent("skip", liveId, runOptions);
}
export function cancelUpToEvent(liveId: string, runOptions?: RunModeExtraOptions) {
  doForAllBeforeEvent("cancel", liveId, runOptions);
}

export function allEventsDo(runMode: RunMode, runOptions?: RunModeExtraOptions) {
  setState((state) => {
    const targetLiveIds = Object.keys(state.liveEvents);
    return _getStatesToRunEventsInMode({ state, runMode, targetLiveIds, runOptions });
  });
}

// ---------------------------------------------
// Make

function makeEventType<T_Params extends Record<any, any>>(event: EventTypeDefinition<T_Params>) {
  return event;
}

export type MakeEventType = <T_Params extends Record<any, any>>(
  eventTypeDefition: EventTypeDefinition<T_Params>
) => EventTypeDefinition<T_Params>;

export function makeEventTypes<
  K_EventName extends string,
  T_EventsMap extends Record<K_EventName, EventTypeDefinition<any>>
>(eventsToAdd: (arg0: { event: MakeEventType }) => T_EventsMap) {
  return eventsToAdd({ event: makeEventType });
}

export function initEventTypeGroups<
  T extends Record<string, ReturnType<typeof makeEventTypes>>,
  T_TimePathItemType extends ItemType
>(
  groups: T,
  options?: {
    defaultElapsedTimePath?: StatePath<T_TimePathItemType>;
    defaultChainId?: string; // leave undefined to generate a random name for each chain
    emojiKeys?: Record<string, string>;
  }
): T {
  repondEventsMeta.defaultElapsedTimePath = options?.defaultElapsedTimePath ?? null;
  repondEventsMeta.defaultChainId = options?.defaultChainId ?? null;
  repondEventsMeta.emojiKeys = options?.emojiKeys ?? {};
  const transformedGroups: Record<string, ReturnType<typeof makeEventTypes>> = {};

  Object.entries(groups).forEach(([key, value]) => {
    // Remove "Events" from the end of the key, if present
    const newKey = key.replace(/Events$/, "");
    transformedGroups[newKey] = value;
  });

  const groupNames = Object.keys(transformedGroups);

  // loop through the groups and rename the effects
  forEach(groupNames, (groupName) => {
    const theGroup = transformedGroups[groupName]!;
    const eventTypeNames = Object.keys(theGroup);
    forEach(eventTypeNames, (eventTypeName) => {
      const theEventType = theGroup[eventTypeName]!;
      theEventType.id = `${groupName}_${eventTypeName}`;
    });
  });

  // Store the transformed groups
  repondEventsMeta.allEventTypeGroups = transformedGroups;

  return groups;
}
