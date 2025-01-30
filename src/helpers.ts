import { forEach } from "chootils/dist/loops";
import { AllState, ItemState, ItemType, StatePath, getState, onNextTick, setState, setState_OLD } from "repond";
import {
  _addEvent,
  _addEvents,
  _getStatesToRunEventsInMode,
  _makeLiveIdFromEventBlock,
  eventBlockBaseToEventBlock,
  eventTuplesToEventBlocks,
  getChainIdFromLiveEventId,
  getLiveEventsIdsUpToLiveEventId,
  getLiveIdsForGroup,
  makeNewChainId,
} from "./internal";
import { repondEventsMeta } from "./meta";
import {
  ChainId,
  DefaultValueParams,
  EmojiKeys,
  EventGroupName,
  EventBlockOptions,
  EventName,
  EventParams,
  EventBlockTuple,
  EventTypeDefinition,
  MakeOptionalWhereUndefined,
  RunMode,
  RunModeExtraOptions,
  TypeOrUndefinedIfAllOptional,
  ValueTypeDefinition,
  ValueGroupName,
  ValueEmojiKeys,
  ValueName,
  ValueParams,
  ValueBlock,
  ValueBlockOptions,
  EventBlock,
  EventBlockTupleLoose,
} from "./types";
import { UnsetEmojiKeysType } from "./declarations";

// ---------------------------------------------
// Utils

type OptionalIfUndefinableSpreadType<T extends any> = T extends undefined
  ? [T?, EventBlockOptions?]
  : [T, EventBlockOptions?];

type ExcludedOriginalKeys = {
  [K in keyof EmojiKeys]: EmojiKeys[K];
}[keyof EmojiKeys];

type AcceptableKeys = Exclude<EventGroupName, ExcludedOriginalKeys> | keyof EmojiKeys;

type ResolveGroupType<T_Key extends AcceptableKeys> = EmojiKeys extends UnsetEmojiKeysType
  ? T_Key
  : T_Key extends keyof EmojiKeys
  ? EmojiKeys[T_Key]
  : T_Key;

// Returns an event block tuple, useful to get a typed event with auto-completion
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
  // options?: EventBlockOptions
  // Destructure args to get params and options
  let params = args[0]; // This would be your number or undefined
  let options = args[1]; // This would be your EventBlockOptions or undefined

  // const eventTuple: EventBlockTuple = [group, name, params ?? {}, options] as EventBlockTuple;
  const eventBlock: EventBlock = { group, name, params: params ?? {}, options } as EventBlock;

  return eventBlock;
}

export function getChainState(chainId: ChainId) {
  return getState("chains", chainId);
}

export function getLiveEventState(liveEventId: string) {
  return getState("liveEvents", liveEventId);
}

export function setLiveEventState(liveEventId: string, state: Partial<ItemState<"liveEvents">>) {
  setState_OLD({ liveEvents: { [liveEventId]: state } });
}

export function setChainState(chainId: ChainId, state: Partial<ItemState<"chains">>) {
  setState_OLD({ chains: { [chainId]: state } });
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
  let options = args[1]; // This would be your EventBlockOptions or undefined

  const eventBlock = eventBlockBaseToEventBlock({ group, name, params: params ?? {} }, options);
  // generate the same chainId that would be generated if the event was added, but it's needed to get the liveId
  // NOTE in _addEvents, a liveId given means its the parent liveId for subEvents, meaning the chainId will be the same as the parent liveId,
  // but since this function only adds one event, the chainId will be different from the liveId
  const chainId = options?.chainId ?? repondEventsMeta.defaultChainId ?? makeNewChainId();
  eventBlock.options.chainId = chainId;
  const liveId = options?.liveId ?? _makeLiveIdFromEventBlock(eventBlock);
  const realLiveId = _addEvent({ group, name, params: params ?? {} }, { ...options, liveId, chainId });

  return realLiveId;
}

export function runPriorityEvent<T_Group extends EventGroupName, T_Name extends EventName<T_Group>, T_GenericParamA>(
  group: T_Group,
  name: T_Name,
  params: EventParams<T_Group, T_Name, T_GenericParamA>,
  options: EventBlockOptions
) {
  // NOTE _addEvent runs _addEvents which has onNextTick inside
  const chainId = _addEvent({ group, name, params: params ?? {} }, { hasPriority: true, ...options });
  return chainId;
}

export function runEvents<T_Events extends EventBlock[]>(eventsToRun: T_Events, options?: EventBlockOptions) {
  // NOTE _addEvents has onNextTick inside

  // NOTE adding a liveId will make the chain a subChain of the liveEvent
  // const chainId = _addEvents(eventTuplesToEventBlocks(eventsToRun), { ...options });
  const chainId = _addEvents(eventsToRun, { ...options });
  return chainId;
}

export function addSubEvents<T_Events extends EventBlock[]>(
  liveId: string,
  eventsToRun: T_Events,
  options?: EventBlockOptions
) {
  runEvents(eventsToRun, { liveId, ...options });
}

export function runPriorityEvents<T_Events extends EventBlock[]>(eventsToRun: T_Events, options?: EventBlockOptions) {
  // NOTE runEvents runs _addEvents which has onNextTick inside
  return runEvents(eventsToRun, { hasPriority: true, ...options });
}

export function eventDo(runMode: RunMode, liveId: string, runOptions?: RunModeExtraOptions) {
  onNextTick(() => {
    setState_OLD((state) => _getStatesToRunEventsInMode({ state, runMode, targetLiveIds: [liveId], runOptions }));
  });
}

export function chainDo(runMode: RunMode, chainId: ChainId, runOptions?: RunModeExtraOptions) {
  onNextTick(() => {
    setState_OLD((state) => _getStatesToRunEventsInMode({ state, runMode, chainId, runOptions }));
  });
}

export function chainWithEventDo(runMode: RunMode, liveId: string, runOptions?: RunModeExtraOptions) {
  setState_OLD((state) => {
    const chainId = getChainIdFromLiveEventId(state, liveId);
    // `no chain found for ${liveId}`
    if (!chainId) return undefined;
    return _getStatesToRunEventsInMode({ state, runMode, chainId, runOptions });
  });
}

export function allGroupEventsDo(groupName: string, runMode: RunMode, runOptions?: RunModeExtraOptions) {
  onNextTick(() => {
    setState_OLD((state) => {
      const targetLiveIds = getLiveIdsForGroup(state, groupName);
      return _getStatesToRunEventsInMode({ state, runMode, targetLiveIds, runOptions });
    });
  });
}

export function doForAllBeforeEvent(runMode: RunMode, liveId: string, runOptions?: RunModeExtraOptions) {
  onNextTick(() => {
    setState_OLD((state) => {
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
  setState_OLD((state) => {
    const targetLiveIds = Object.keys(state.liveEvents);
    return _getStatesToRunEventsInMode({ state, runMode, targetLiveIds, runOptions });
  });
}

// ---------------------------------------------

export function cancelFastChain(chainId: ChainId) {
  // set isCancelled to true,
  // and while it can’t find another child in meta,
  // keep setting children to isCanceled

  const fastChainMeta = repondEventsMeta.fastChain.nowFastChainsInfoMap[chainId];
  if (!fastChainMeta) return;

  fastChainMeta.isCanceled = true;
  let nextChildChainId = fastChainMeta.nowChildFastChainId;
  while (nextChildChainId) {
    const nextChildMeta = repondEventsMeta.fastChain.nowFastChainsInfoMap[nextChildChainId];
    if (!nextChildMeta) break;
    nextChildMeta.isCanceled = true;
    nextChildChainId = nextChildMeta.nowChildFastChainId;
  }
}

// ---------------------------------------------
// Make Events

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

// ---------------------------------------------
// Make Values

function makeValueType<T_Params extends Record<any, any>>(value: ValueTypeDefinition<T_Params>) {
  return value;
}

export type MakeValueType = <T_Params extends Record<any, any>>(
  valueTypeDefition: ValueTypeDefinition<T_Params>
) => ValueTypeDefinition<T_Params>;

export function makeValueTypes<
  K_ValueName extends string,
  T_ValuesMap extends Record<K_ValueName, ValueTypeDefinition<any>>
>(valuesToAdd: (arg0: { value: MakeValueType }) => T_ValuesMap) {
  return valuesToAdd({ value: makeValueType });
}

export function initValueTypeGroups<T extends Record<string, ReturnType<typeof makeValueTypes>>>(
  groups: T,
  options?: {
    // Can add some defaults for values here if wanted
    emojiKeys?: Record<string, string>;
  }
): T {
  repondEventsMeta.valueEmojiKeys = options?.emojiKeys ?? {};
  const transformedGroups: Record<string, ReturnType<typeof makeValueTypes>> = {};

  Object.entries(groups).forEach(([key, value]) => {
    // Remove "Values" from the end of the key, if present
    const newKey = key.replace(/Values$/, "");
    transformedGroups[newKey] = value;
  });

  const groupNames = Object.keys(transformedGroups);

  // loop through the groups and rename the effects
  forEach(groupNames, (groupName) => {
    const theGroup = transformedGroups[groupName]!;
    const valueTypeNames = Object.keys(theGroup);
    forEach(valueTypeNames, (valueTypeName) => {
      const theValueType = theGroup[valueTypeName]!;
      theValueType.id = `${groupName}_${valueTypeName}`;
    });
  });

  // Store the transformed groups
  repondEventsMeta.allValueTypeGroups = transformedGroups;

  return groups;
}

type OptionalIfUndefinableSpreadType_Value<T extends any> = T extends undefined
  ? [T?, ValueBlockOptions?]
  : [T, ValueBlockOptions?];

type ExcludedOriginalValueKeys = {
  [K in keyof EmojiKeys]: EmojiKeys[K];
}[keyof EmojiKeys];

type AcceptableValueKeys = Exclude<ValueGroupName, ExcludedOriginalValueKeys> | keyof ValueEmojiKeys;

type ResolveValueType<T_Key extends AcceptableValueKeys> = ValueEmojiKeys extends UnsetEmojiKeysType
  ? T_Key
  : T_Key extends keyof ValueEmojiKeys
  ? ValueEmojiKeys[T_Key]
  : T_Key;

// Returns an event block tuple, useful to get a typed event with auto-completion
// meant to use with runEvents like runEvents([run("group", "name", params), run("group", "name", params)])
export function makeValue<
  T_Key extends AcceptableValueKeys,
  // T_Group extends T_Key extends keyof EmojiKeys ? EmojiKeys[T_Key] : T_Key,
  T_Group extends ResolveValueType<T_Key>,
  T_Name extends ValueName<T_Group>,
  T_GenericParamA
>(
  groupOrEmoji: T_Key,
  name: T_Name,
  ...args: OptionalIfUndefinableSpreadType_Value<
    TypeOrUndefinedIfAllOptional<ValueParams<T_Group, T_Name, T_GenericParamA>>
  >
) {
  const group =
    groupOrEmoji in repondEventsMeta.valueEmojiKeys
      ? repondEventsMeta.emojiKeys[groupOrEmoji as keyof EmojiKeys]
      : groupOrEmoji;
  // ...params: OptionalIfUndefinableSpreadType<
  //   TypeOrUndefinedIfAllOptional<EventParams<T_Group, T_Name, T_GenericParamA>>
  // >,
  // options?: EventBlockOptions
  // Destructure args to get params and options
  let params = args[0];
  let options = args[1]; // This would be your EventBlockOptions or undefined

  const valueBlock: ValueBlock = { group, name, params: params || {}, options: options ?? {}, type: "value" };

  return valueBlock;
}
