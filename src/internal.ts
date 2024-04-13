import { breakableForEach } from "chootils/dist/loops";
import { AllState, addItem, getItemWillExist, getState, onNextTick, removeItem, setState } from "repond";
import { getChainState, getLiveEventState } from "./helpers";
import { repondEventsMeta as meta, repondEventsMeta } from "./meta";
import {
  EventInstance,
  EventInstanceOptions,
  EventInstanceWithIds,
  EventNodeLoose,
  EventRunLiveInfo,
  EventTuple,
  EventTypeDefinition,
  ItemState,
  RunMode,
  RunModeExtraOptions,
} from "./types";

export function getElapsedTime(liveId?: string) {
  let foundElapsedTimeStatePath = meta.defaultElapsedTimePath;
  if (liveId) {
    const liveEventElapsedTimePath = getLiveEventState(liveId)?.elapsedTimePath;
    foundElapsedTimeStatePath = liveEventElapsedTimePath ?? foundElapsedTimeStatePath;
  }

  if (!foundElapsedTimeStatePath) return console.warn("no elapsedTimePath found"), 0;
  const [itemType, itemId, itemProp] = foundElapsedTimeStatePath;

  // Using any since the item type is dynamic
  const foundElapsedTime = (getState() as any)[itemType]?.[itemId]?.[itemProp] as number | undefined;
  if (!foundElapsedTime) return console.warn("no elapsedTime state found for ", itemType, itemId, itemProp), 0;
  return foundElapsedTime;
}

export function eventTupleToEventInstance(eventTuple: EventTuple): EventInstance {
  return {
    group: eventTuple[0],
    name: eventTuple[1],
    params: eventTuple[2],
    options: eventTuple[3] ?? {},
  };
}

export function eventTuplesToEventInstances(eventTuples: EventTuple[]): EventInstance[] {
  return eventTuples.map(eventTupleToEventInstance);
}

export function getLiveIdsForGroup(state: AllState, group: string) {
  const allLiveEventIds = Object.keys(state.liveEvents);
  return allLiveEventIds.filter((liveId) => state.liveEvents[liveId]?.event.group === group);
}

export function getLiveEventsIdsUpToLiveEventId(state: AllState, liveId: string) {
  const chainId = getChainIdFromLiveEventId(state, liveId);
  // `no chain found for ${liveId}`
  if (!chainId) return [];
  const chainState = state.chains[chainId];
  const liveIds = chainState?.liveEventIds ?? [];
  const eventIndex = liveIds.indexOf(liveId);
  if (eventIndex === -1) return console.warn(`no event found for ${liveId}`), [];
  return liveIds.slice(0, eventIndex + 1);
}

export function findFirstNonActiveEventIndex(state: AllState, liveEventIds: string[]): number {
  if (liveEventIds.length === 0) {
    return 0; // If the list is empty, return 0
  }

  const firstEventState = state.liveEvents?.[liveEventIds[0]!];
  const firstEventCanStart = firstEventState?.nowRunMode === "add";
  if ((!firstEventState || !firstEventState.isParallel) && firstEventCanStart) {
    return 1; // If the first event is not parallel, immediately return 1
  }
  if (!firstEventCanStart) return 0; // If the first event is not ready to start, return 0

  // If the first event is parallel, find the first non-parallel event, or non ready to start parallel event
  for (let i = 1; i < liveEventIds.length; i++) {
    const eventState = state.liveEvents?.[liveEventIds[i]!];
    const eventCanStart = eventState?.nowRunMode === "add";
    if (!eventState || (!eventState.isParallel && eventCanStart) || (eventState?.isParallel && !eventCanStart)) {
      return i; // Return the 0-based index of the first non-parallel event
    }
  }

  // If all events are parallel, return the length of the list
  return firstEventCanStart ? liveEventIds.length : 0;
}

export function getActiveEventIds(state: AllState, liveEventIds: string[]): string[] {
  const index = findFirstNonActiveEventIndex(state, liveEventIds);
  // If index is 0, no events are active, otherwise slice up to index
  return index === 0 ? [] : liveEventIds.slice(0, index);
}

function getInsertEventIdsAfterActive(state: AllState, liveEventIds: string[], newEventIds: string[]): string[] {
  const index = findFirstNonActiveEventIndex(state, liveEventIds);
  return [...liveEventIds.slice(0, index), ...newEventIds, ...liveEventIds.slice(index)];
}

export function getChainIdFromLiveEventId(state: AllState, liveId: string) {
  // find the chainId from the liveId, then skip the chain
  let foundChainId: string | undefined;
  const allChainIds = Object.keys(state.chains);
  breakableForEach(allChainIds, (chainId) => {
    const chainState = getState().chains[chainId];
    if (chainState?.liveEventIds.includes(liveId)) {
      foundChainId = chainId;
      return true; // break from the loop
    }
  });
  return foundChainId;
}

export function getNewChainId() {
  return `chain_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

export function runEventHandler(liveEventId: string) {
  const liveEventState = getLiveEventState(liveEventId);
  if (!liveEventState) return console.warn(`no liveEvent found for ${liveEventId}`);

  const { nowRunMode: runMode } = liveEventState;
  if (!runMode) return console.warn(`no runMode found for ${liveEventId}`);

  const eventTypeDefinition = meta.allEventTypeGroups[liveEventState.event.group]?.[liveEventState.event.name];
  const eventHandler = eventTypeDefinition.run;

  if (!eventHandler)
    return console.warn(`no handler found for ${liveEventState.event.group}.${liveEventState.event.name}`);

  const elapsedTime = getElapsedTime(liveEventState.chainId);

  let relevantTimeProp: keyof AllState["liveEvents"][string] = "startTime";

  // NOTE "unpause" or "unsuspend" is never seen in the handler, since it will resume to what it was before pause or suspend

  if (runMode === "start") relevantTimeProp = "startTime";
  else if (runMode === "add") relevantTimeProp = "addTime";
  else if (runMode === "pause") relevantTimeProp = "pauseTime";
  else if (runMode === "suspend") relevantTimeProp = "suspendTime";

  const isUnpausing = liveEventState.unpauseTime === liveEventState[relevantTimeProp];
  const isUnsuspending = liveEventState.unsuspendTime === liveEventState[relevantTimeProp];
  const isUnfreezing = isUnpausing || isUnsuspending;
  const isFreezing = runMode === "pause" || runMode === "suspend";

  const liveInfo: EventRunLiveInfo = {
    runBy: "repond-events",
    addedBy: liveEventState.addedBy ?? "unknown",
    runMode,
    didStart: (liveEventState.startTime ?? 0) > 0, // a little different to isActive, if it started at all?
    chainId: liveEventState.chainId,
    liveId: liveEventState.id,
    remainingTime: 0,
    elapsedTime,
    isUnpausing,
    isUnsuspending,
    isUnfreezing,
    isFreezing,
    addTime: liveEventState.addTime ?? 0,
    startTime: liveEventState.startTime ?? 0,
    pauseTime: liveEventState.pauseTime ?? 0,
    unpauseTime: liveEventState.unpauseTime ?? 0,
    suspendTime: liveEventState.suspendTime ?? 0,
    unsuspendTime: liveEventState.unsuspendTime ?? 0,
    goalEndTime: liveEventState.goalEndTime ?? 0,
  };

  // Run the event handler
  eventHandler(liveEventState.event.params, liveInfo);
}

export function finalizeEvent(liveEventId: string) {
  setState(
    (state) => {
      const liveEventState = state.liveEvents[liveEventId];
      if (!liveEventState) return console.warn(`no liveEvent found for ${liveEventId}`), {};
      const chainId = liveEventState.chainId;
      if (!chainId) return {}; // `no chain found for ${liveEventId}`
      const chainState = state.chains[chainId];
      if (!chainState) return {}; // `no chain found for ${chainId}`

      // Remove this liveEventId from the chain
      const newLiveEventIds = chainState.liveEventIds.filter((id) => id !== liveEventId);
      return { chains: { [chainId]: { liveEventIds: newLiveEventIds } } };
    },
    () => removeItem({ type: "liveEvents", id: liveEventId })
  );
}

function _makeLiveEventStateFromEvent(event: EventInstanceWithIds): ItemState<"liveEvents"> {
  const { chainId, liveId, addedBy, isParallel, timePath, hasPriority } = event.options;

  const eventType = getEventTypeDefinition(event.group, event.name);
  let foundElapsedTime = 0;
  const foundElapsedTimeStatePath = timePath ?? meta.defaultElapsedTimePath;
  if (foundElapsedTimeStatePath) {
    const [itemType, itemId, itemProp] = foundElapsedTimeStatePath;
    // Using any since the item type is dynamic
    foundElapsedTime = (getState() as any)[itemType]?.[itemId]?.[itemProp] as number | undefined;
  }

  // Finish instantly by default, can set to Infinity for no automatic end
  const goalEndTime = eventType.duration && foundElapsedTime ? foundElapsedTime + eventType.duration : 0;

  return {
    id: liveId,
    // nowRunMode: null,
    nowRunMode: "add",
    // isActive: false,
    elapsedTimePath: timePath ?? meta.defaultElapsedTimePath,
    isParallel: !!isParallel,
    addedBy: addedBy ?? null,
    chainId,
    event,
    addTime: Date.now(),
    readyTime: null,
    startTime: null,
    pauseTime: null,
    unpauseTime: null,
    suspendTime: null,
    unsuspendTime: null,
    goalEndTime,
    goalRunModeOptions: null,
    runBy: null,
    runModeOptionsWhenReady: null,
    runModeBeforePause: null,
    runModeBeforeSuspend: null,
  };
}

export function _makeLiveIdFromEventInstance(event: EventInstance) {
  const { chainId, liveId, addedBy } = event.options;
  const chainState = chainId ? getChainState(chainId) : undefined;

  return (
    liveId ??
    `${event.group}_${event.name}_${chainId}${addedBy ? "_by" + addedBy : ""}${
      "_event_" + Math.floor(Math.random() * 10000)
    }`
  );
}

export function makeNewChainId() {
  return `chain_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

export function eventInstanceToEventNode(eventInstance: EventInstance): EventNodeLoose {
  return {
    group: eventInstance.group,
    name: eventInstance.name,
    params: eventInstance.params,
  };
}

export function eventNodeToEventInstance(eventNode: EventNodeLoose, options?: EventInstanceOptions): EventInstance {
  return {
    ...eventNode,
    options: options ?? {},
  };
}

function getEventTypeDefinition(group: string, name: string) {
  return meta.allEventTypeGroups[group]?.[name] as EventTypeDefinition<any>;
}

export function _addEvents(eventIntances: EventInstance[], options: EventInstanceOptions) {
  const chainId = options.chainId ?? repondEventsMeta.defaultChainId ?? makeNewChainId();
  onNextTick(() => {
    const events = eventIntances.map((event) => {
      const eventType = getEventTypeDefinition(event.group, event.name);
      return {
        ...event,
        options: {
          ...options,
          ...event.options,
          isParallel: options?.isParallel ?? event.options.isParallel ?? eventType.isParallel,
          chainId, // NOTE the chainId is always the same for all events added at once
          timePath: options.timePath ?? event.options.timePath ?? eventType.timePath,
        },
      };
    });

    const chainDoesntExist = !getItemWillExist("chains", chainId);

    if (chainDoesntExist) {
      // if the chain doesn’t exist, create the chain with the events
      // _addChain(eventIntances, { ...options, chainId });
      const newChainState: ItemState<"chains"> = { id: chainId, liveEventIds: [] };
      addItem({ id: chainId, type: "chains", state: newChainState }, () => {});
    }
    const newLiveIds = [] as string[];
    events.forEach((event, index) => {
      const eventOptions = event.options;
      const chainId = options.chainId ?? eventOptions.chainId; // NOTE I think this aleways has to be the same
      if (!chainId) return console.warn(`no chainId found for ${event.group}.${event.name}`), {};
      const addedBy = eventOptions.addedBy ?? options.addedBy;
      const eventWithNewOptions = { ...event, options: { ...event.options, chainId, addedBy } };
      const liveId = eventOptions.liveId ?? _makeLiveIdFromEventInstance(eventWithNewOptions);
      newLiveIds.push(liveId);
      const eventWithLiveId = { ...eventWithNewOptions, options: { ...eventWithNewOptions.options, liveId } };
      addItem({ id: liveId, type: "liveEvents", state: _makeLiveEventStateFromEvent(eventWithLiveId) });
    });

    setState((state) => {
      const chainState = state.chains[chainId];

      // NOTE make sure the chain is added before setting the chain state
      if (!chainState) return console.warn(`chain ${chainId} doesn't exist`), {};

      const nowChainEventIds = chainState.liveEventIds;
      const newChainEventIds = options.hasPriority
        ? getInsertEventIdsAfterActive(state, nowChainEventIds, newLiveIds)
        : [...nowChainEventIds, ...newLiveIds];

      const newPartialChainState: Record<string, Partial<ItemState<"chains">>> = {
        [chainId]: { liveEventIds: newChainEventIds },
      };

      return { chains: newPartialChainState };
    });
  });
  return chainId;

  // NOTE events are auto started by the chain after the liveEventIds are set
}

export function _addEvent(event: EventNodeLoose, options: EventInstanceOptions) {
  const eventInstance: EventInstance = { ...event, options: options };
  const newChainId = _addEvents([eventInstance], options);
  return newChainId;
}

export function _getStatesToRunEventsInMode({
  state,
  runMode,
  targetLiveIds,
  chainId,
  runOptions,
}: {
  state: AllState;
  runMode: RunMode;
  chainId?: string;
  targetLiveIds?: string[];
  runOptions?: RunModeExtraOptions;
}) {
  const liveIdsByChain: Record<string, string[]> = {};
  if (chainId && targetLiveIds) {
    liveIdsByChain[chainId] = [...targetLiveIds];
  } else if (chainId && !targetLiveIds) {
    const chainState = state.chains[chainId];
    targetLiveIds = chainState?.liveEventIds;
    if (!targetLiveIds) return {}; // `no liveEventIds found for chain ${chainId}`
    liveIdsByChain[chainId] = [...targetLiveIds];
  } else if (!chainId && targetLiveIds) {
    for (const liveId of targetLiveIds) {
      const chainId = getChainIdFromLiveEventId(state, liveId);
      if (!chainId) return {}; // `no chain found for ${liveId}`
      if (!liveIdsByChain[chainId]) liveIdsByChain[chainId] = [];
      liveIdsByChain[chainId]!.push(liveId);
    }
  }

  const foundChainIds = Object.keys(liveIdsByChain);
  const newPartialLiveEventsState: Record<string, Partial<ItemState<"liveEvents">>> = {};
  const newPartialChainsState: Record<string, Partial<ItemState<"chains">>> = {};

  for (const chainId of foundChainIds) {
    let targetChainLiveIdsUnordered = liveIdsByChain[chainId];
    const nowChainLiveIds = state.chains[chainId]?.liveEventIds;

    if (!nowChainLiveIds || !targetChainLiveIdsUnordered) continue;
    // get the liveIds that are in the chain and also in the liveIds array in order, or all if liveIds is not set
    const targetChainLiveIds = nowChainLiveIds.filter((liveId) => targetChainLiveIdsUnordered.includes(liveId));
    let newChainLiveEventIds = [...nowChainLiveIds];

    for (const liveEventId of targetChainLiveIds) {
      const liveEventState = state.liveEvents[liveEventId];
      if (runMode === "skip") {
        newPartialLiveEventsState[liveEventId] = { runModeOptionsWhenReady: { runMode, ...runOptions } };
      } else {
        newPartialLiveEventsState[liveEventId] = { nowRunMode: runMode, ...runOptions };
      }

      // If the new runMode is "cancel", remove it from the chain, if it wasn't started yet
      // NOTE original idea was to also check if it started, so other events wait for it, but removing it instantly might be better
      if (runMode === "cancel") {
        const index = newChainLiveEventIds.indexOf(liveEventId);
        if (index > -1) newChainLiveEventIds.splice(index, 1);
      }
      // The liveEvent will remove itself from repond state if it was cancled or finished
    }
    newPartialChainsState[chainId] = { liveEventIds: newChainLiveEventIds };
  }

  return { liveEvents: newPartialLiveEventsState, chains: newPartialChainsState };
}
