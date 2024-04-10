import { forEach } from "chootils/dist/loops";
import { AllState, ItemType, getState, onNextTick, setState } from "repond";
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
} from "./internal";
import { repondEventsMeta } from "./meta";
import {
  EventGroupName,
  EventInstanceOptions,
  EventName,
  EventTuple,
  EventTypeDefinition,
  ItemState,
  ParamsType,
  RunMode,
  RunModeExtraOptions,
  TimePathArray,
} from "./types";

// ---------------------------------------------
// Utils

// Returns an event instance typle, useful to get a typed event with auto-completion
export function toDo<T_Group extends EventGroupName, T_Name extends EventName<T_Group>>(
  group: T_Group,
  name: T_Name,
  params: ParamsType<T_Group, T_Name>,
  options?: EventInstanceOptions
) {
  const eventTuple: EventTuple = [group, name, params, options] as EventTuple;

  return eventTuple;
}

export function getChainState(chainId: string) {
  return getState().chains[chainId];
}

export function getLiveEventState(liveEventId: string) {
  return getState().liveEvents[liveEventId];
}

export function setLiveEventState(liveEventId: string, state: Partial<ItemState<"liveEvents">>) {
  setState({ liveEvents: { [liveEventId]: state } });
}

export function setChainState(chainId: string, state: Partial<ItemState<"chains">>) {
  setState({ chains: { [chainId]: state } });
}

// ---------------------------------------------
// Events and chains

// NOTE most of the helper functions
//   - Run inside set state - to read the latest state if setStates were run before this
//   - Run inside onNextTick - to run after the current setStates and effects, to run at the start of the next frame

export function runEvent<T_Group extends EventGroupName, T_Name extends EventName<T_Group>>(
  group: T_Group,
  name: T_Name,
  params: ParamsType<T_Group, T_Name>,
  options?: EventInstanceOptions
) {
  const eventInstance = eventNodeToEventInstance({ group, name, params: params ?? {} }, options);
  const newLiveId = options?.liveId ?? _makeLiveIdFromEventInstance(eventInstance);
  const chainId = _addEvent({ group, name, params: params ?? {} }, { ...options, liveId: newLiveId });
  return newLiveId;
}

export function runPriorityEvent<T_Group extends EventGroupName, T_Name extends EventName<T_Group>>(
  group: T_Group,
  name: T_Name,
  params: ParamsType<T_Group, T_Name>,
  options: EventInstanceOptions
) {
  // NOTE _addEvent runs _addEvents which has onNextTick inside
  const chainId = _addEvent({ group, name, params: params ?? {} }, { hasPriority: true, ...options });
  return chainId;
}

export function runEvents<T_Events extends EventTuple[]>(eventsToRun: T_Events, options?: EventInstanceOptions) {
  // NOTE _addEvents has onNextTick inside
  const chainId = _addEvents(eventTuplesToEventInstances(eventsToRun), { ...options });
  return chainId;
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

export function chainDo(runMode: RunMode, chainId: string, runOptions?: RunModeExtraOptions) {
  onNextTick(() => {
    setState((state) => _getStatesToRunEventsInMode({ state, runMode, chainId, runOptions }));
  });
}

export function chainWithEventDo(runMode: RunMode, liveId: string, runOptions?: RunModeExtraOptions) {
  setState((state) => {
    const chainId = getChainIdFromLiveEventId(state, liveId);
    if (!chainId) return console.warn(`no chain found for ${liveId}`), undefined;
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
  T_TimePathItemType extends ItemType,
  T_TimePathItemId extends keyof AllState[T_TimePathItemType]
>(
  groups: T,
  options?: {
    defaultElapsedTimePath?: TimePathArray<T_TimePathItemType, T_TimePathItemId>;
  }
): T {
  repondEventsMeta.defaultElapsedTimePath = options?.defaultElapsedTimePath ?? null;
  const transformedGroups: Record<string, ReturnType<typeof makeEventTypes>> = {};

  Object.entries(groups).forEach(([key, value]) => {
    // Remove "Effects" from the key, if present
    const newKey = key.replace("Events", "");
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
