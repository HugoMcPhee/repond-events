import { breakableForEach, forEach } from "chootils/dist/loops";
import {
  AllState,
  ItemState,
  addItem,
  getItemWillExist,
  getState,
  getState_OLD,
  onNextTick,
  removeItem,
  setState,
  whenSettingStates,
} from "repond";
import { getChainState, getLiveEventState } from "./helpers";
import { repondEventsMeta as meta, repondEventsMeta } from "./meta";
import {
  EventBlock,
  EventBlockOptions,
  EventBlockWithIds,
  EventBlockBase,
  EventRunLiveInfo,
  EventTypeDefinition,
  RunMode,
  RunModeExtraOptions,
  ParamMap,
  EventBlockTuple,
} from "./types";
import { evaluateParams } from "./valueHelpers";

export function getElapsedTime(liveId?: string) {
  let foundElapsedTimeStatePath = meta.defaultElapsedTimePath;
  if (liveId) {
    const liveEventElapsedTimePath = getLiveEventState(liveId)?.elapsedTimePath;
    foundElapsedTimeStatePath = liveEventElapsedTimePath ?? foundElapsedTimeStatePath;
  }

  if (!foundElapsedTimeStatePath) return console.warn("no elapsedTimePath found"), 0;
  const [itemType, itemId, itemProp] = foundElapsedTimeStatePath;

  // Using any since the item type is dynamic
  const foundElapsedTime = (getState(itemType, itemId) as any)?.[itemProp] as number | undefined;
  if (!foundElapsedTime) return console.warn("no elapsedTime state found for ", itemType, itemId, itemProp), 0;
  return foundElapsedTime;
}

export function eventTupleToEventBlock(eventTuple: EventBlockTuple): EventBlock {
  return {
    group: eventTuple[0],
    name: eventTuple[1],
    params: eventTuple[2] as any,
    options: eventTuple[3] ?? {},
  };
}

export function toEventBlockIfNeeded(event: EventBlockTuple | EventBlock): EventBlock {
  return Array.isArray(event) ? eventTupleToEventBlock(event) : event;
}

export function eventTuplesToEventBlocks(eventTuples: (EventBlockTuple | EventBlock)[]): EventBlock[] {
  // return eventTuples.map(eventTupleToEventBlock);
  return eventTuples.map(toEventBlockIfNeeded);
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
    const chainState = getState("chains", chainId);
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

// TODO maybe update the name to runLiveEventHandler because of isFast handling running events differently
export async function runEventHandler(liveEventId: string) {
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

  const relevantTime = liveEventState[relevantTimeProp]; // inifity if it hasn't been set yet

  const isUnpausing = relevantTime != null && liveEventState.unpauseTime === relevantTime;
  const isUnsuspending = relevantTime != null && liveEventState.unsuspendTime === relevantTime;
  const isUnfreezing = isUnpausing || isUnsuspending;
  const isFreezing = runMode === "pause" || runMode === "suspend";

  const unpauseTime = liveEventState.unpauseTime ?? 0;
  const unsuspendTime = liveEventState.unsuspendTime ?? 0;

  const liveInfo: EventRunLiveInfo = {
    runBy: "repond-events",
    addedBy: liveEventState.addedBy ?? "unknown",
    runMode,
    isFast: false, // TODO Support isFast, It might not ever be true in this part
    didStart: (liveEventState.startTime ?? 0) > 0, // a little different to isActive, if it started at all?
    chainId: liveEventState.chainId,
    liveId: liveEventState.id,
    remainingTime: 0,
    elapsedTime,
    isUnpausing,
    isUnsuspending,
    isUnfreezing,
    isFreezing,
    isFirstAdd: runMode === "add" && !isUnfreezing,
    isFirstStart: runMode === "start" && !isUnfreezing,
    isFirstPause: runMode === "pause" && !unpauseTime,
    isFirstSuspend: runMode === "suspend" && !unsuspendTime,
    addTime: liveEventState.addTime ?? 0,
    startTime: liveEventState.startTime ?? 0,
    pauseTime: liveEventState.pauseTime ?? 0,
    unpauseTime,
    suspendTime: liveEventState.suspendTime ?? 0,
    unsuspendTime,
    goalEndTime: liveEventState.goalEndTime ?? 0,
  };

  const paramsWithDefaults = { ...eventTypeDefinition.params, ...liveEventState.event.params };

  // If the event doesn't have evaluatedParams in state, evaluate them
  // If the run mode is "run", and it's the first time the event is run, re-evaluate the params

  let evaluatedParams: ParamMap | undefined | null = liveEventState.evaluatedParams;

  if (!evaluatedParams || (runMode === "start" && liveInfo.isFirstStart)) {
    evaluatedParams = await evaluateParams(paramsWithDefaults, {
      addedBy: liveInfo.addedBy,
      runBy: liveInfo.runBy,
      parentChainId: liveInfo.chainId,
      valueIdBase: liveInfo.liveId,
    });
  }

  // Run the event handler
  if (evaluatedParams) {
    eventHandler(evaluatedParams, liveInfo);
    setState(`liveEvents.evaluatedParams`, evaluatedParams, liveEventId);
  } else {
    console.warn(
      `no evaluatedParams found for ${liveEventId} , ${eventTypeDefinition.group}.${eventTypeDefinition.name}`
    );
  }
}

export function finalizeEvent(liveEventId: string) {
  whenSettingStates(() => {
    const liveEventState = getState("liveEvents", liveEventId);
    if (!liveEventState) return console.warn(`no liveEvent found for ${liveEventId}`), {};
    const chainId = liveEventState.chainId;
    if (!chainId) return {}; // `no chain found for ${liveEventId}`
    const chainState = getState("chains", chainId);
    if (!chainState) return {}; // `no chain found for ${chainId}`

    // Remove this liveEventId from the chain
    const newLiveEventIds = chainState.liveEventIds.filter((id) => id !== liveEventId);
    setState(`chains.liveEventIds`, newLiveEventIds, chainId);
  });
  onNextTick(() => removeItem({ type: "liveEvents", id: liveEventId }));
}

function _makeLiveEventStateFromEvent(event: EventBlockWithIds): ItemState<"liveEvents"> {
  const { chainId, liveId, addedBy, isParallel, timePath, hasPriority, duration, parentChainId } = event.options;

  const eventType = getEventTypeDefinition(event.group, event.name);
  let foundElapsedTime = 0;
  const foundElapsedTimeStatePath = timePath ?? meta.defaultElapsedTimePath;
  if (foundElapsedTimeStatePath) {
    const [itemType, itemId, itemProp] = foundElapsedTimeStatePath;
    // Using any since the item type is dynamic
    foundElapsedTime = ((getState(itemType, itemId) as any)?.[itemProp] as number | undefined) ?? 0;
  }

  // Finish instantly by default, can set to Infinity for no automatic end
  // If a duration's provided, then it sets the endTime in when the live event starts
  const goalEndTime = 0;

  return {
    id: liveId,
    // nowRunMode: null,
    nowRunMode: "add",
    // isActive: false,
    elapsedTimePath: timePath ?? meta.defaultElapsedTimePath,
    isParallel: !!isParallel,
    duration: duration ?? null,
    addedBy: addedBy ?? null,
    chainId,
    parentChainId,
    event,
    addTime: Date.now(),
    readyTime: null,
    startTime: null,
    pauseTime: null,
    unpauseTime: null,
    suspendTime: null,
    unsuspendTime: null,
    goalEndTime,
    runBy: null,
    runModeOptionsWhenReady: null,
    runModeBeforePause: null,
    runModeBeforeSuspend: null,
  };
}

export function _makeLiveIdFromEventBlock(event: EventBlock) {
  const { chainId, liveId, addedBy } = event.options;

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

export function eventBlockBaseToEventBlock(eventBlockBase: EventBlockBase, options?: EventBlockOptions): EventBlock {
  return {
    ...eventBlockBase,
    options: options ?? {},
  };
}

export function getEventTypeDefinition(group: string, name: string) {
  return meta.allEventTypeGroups[group]?.[name] as EventTypeDefinition<any>;
}

// Meant to be used for fast mode
// in a loop until the chain is finished
async function runEventFastMode(event: EventBlock, options: EventBlockOptions) {
  // Finds and runs the event handler for the event
  // it will always run immediately

  const { chainId } = options;
  if (!chainId) return console.warn(`no chainId found for fast ${event.group}.${event.name}`), {};

  const eventTypeDefinition = meta.allEventTypeGroups[event.group]?.[event.name];
  const eventHandler = eventTypeDefinition.run;

  // let evaluatedParams: ParamMap | undefined | null = liveEventState.evaluatedParams;
  const paramsWithDefaults = { ...eventTypeDefinition.params, ...event.params };

  const evaluatedParams = await evaluateParams(paramsWithDefaults, {
    addedBy: options.addedBy,
    runBy: "repond-events",
    parentChainId: options.parentChainId,
    valueIdBase: chainId,
  });

  const liveInfo: EventRunLiveInfo = {
    runBy: "repond-events",
    addedBy: "unknown", // TODO maybe add addedBy for fast mode
    runMode: "start",
    isFast: true,
    didStart: true,
    chainId: chainId,
    liveId: "unknown", // NOTE no live id in fast mode
    remainingTime: 0,
    elapsedTime: 0,
    isUnpausing: false,
    isUnsuspending: false,
    isUnfreezing: false,
    isFreezing: false,
    isFirstAdd: true,
    isFirstStart: true,
    isFirstPause: false,
    isFirstSuspend: false,
    addTime: Date.now(),
    startTime: Date.now(),
    pauseTime: 0,
    unpauseTime: 0,
    suspendTime: 0,
    unsuspendTime: 0,
    goalEndTime: Date.now(),
  };

  await eventHandler(event.params, liveInfo);
}

export function _addEvents(eventBlocks: EventBlock[], listOptions: EventBlockOptions) {
  // If the parents liveEventId is provided, then it creates a chain with the same id, which makes it a subChain
  // This means the event will automatically finish when the subchain finishes
  const liveId = listOptions.liveId;
  const chainId = liveId ?? listOptions.chainId ?? repondEventsMeta.defaultChainId ?? makeNewChainId();

  const parentChainId = listOptions.parentChainId;

  const isFast = listOptions.isFast ?? false;

  const isForSubChain = !!liveId;

  // If it's fast mode, it will run the events immediately
  // and not add live events to the state
  if (isFast) {
    console.warn("fast mode not supported yet for _addEvents");
    const fastChainMeta = repondEventsMeta.fastChain;

    // If the parent chain is not a fast chain, then set up the new fastChain meta info
    const parentChainIsFast = parentChainId ? !!fastChainMeta.nowFastChainsInfoMap[parentChainId] : false;

    // If its the first fast chain, set the root fast chain id
    if (!parentChainIsFast) {
      fastChainMeta.nowRootFastChainId = chainId;
      fastChainMeta.nowRootFastChainParentId = parentChainId;
      fastChainMeta.nowFastChainsInfoMap = {};
      fastChainMeta.nowFastChainsInfoMap[chainId] = {
        nowChildFastChainId: undefined,
        isCanceled: false,
        parentFastChainId: undefined,
        variablesMap: {},
      };
    } else {
      // If the parent chain is a fast chain, then set up the new fastChain meta info
      if (parentChainId) {
        const parentFastChainInfo = fastChainMeta.nowFastChainsInfoMap[parentChainId];
        parentFastChainInfo.nowChildFastChainId = chainId;
      }
      fastChainMeta.nowFastChainsInfoMap[chainId] = {
        nowChildFastChainId: undefined,
        isCanceled: false,
        parentFastChainId: parentChainId,
        variablesMap: {},
      };
    }

    // Run through all the events in fast mode, while the chain isn't canceled
    for (const event of eventBlocks) {
      if (fastChainMeta.nowFastChainsInfoMap[chainId].isCanceled) {
        break;
      }
      runEventFastMode(event, listOptions);
    }

    // If it's the first fast chain, when it finishes, clear the fast chain meta info
    if (!parentChainIsFast) {
      fastChainMeta.nowRootFastChainId = undefined;
      fastChainMeta.nowRootFastChainParentId = undefined;
      fastChainMeta.nowFastChainsInfoMap = {};
    }

    return chainId;
  }

  const addTheLiveEvents = () => {
    const events = eventBlocks.map((event) => {
      const eventType = getEventTypeDefinition(event.group, event.name);
      if (!eventType) {
        console.warn(`no eventType found for ${event.group}.${event.name}`);
      }

      return {
        ...event,
        options: {
          ...listOptions,
          liveId: undefined,
          ...event.options,
          addedBy: event.options?.addedBy ?? listOptions?.addedBy,
          isParallel: event.options?.isParallel ?? listOptions?.isParallel ?? eventType?.isParallel,
          chainId, // NOTE the chainId is always the same for all events added at once
          timePath: event.options?.timePath ?? listOptions.timePath ?? eventType?.timePath,
          duration: event.options?.duration ?? listOptions.duration ?? eventType?.duration,
        },
      };
    });

    const chainDoesntExist = !getItemWillExist("chains", chainId);

    // Check if the parent liveEvent is already running
    const existingParentLiveEventForSubChain = liveId ? getState("liveEvents", liveId) : null;
    const parentLiveEventRunMode = existingParentLiveEventForSubChain?.nowRunMode ?? null;
    const parentLiveEventHasNonAddRunMode = liveId ? parentLiveEventRunMode && parentLiveEventRunMode !== "add" : false;

    if (chainDoesntExist) {
      // if the chain doesn’t exist, create the chain with the events
      // dont auto start the chain if it’s a subChain, it will start when the parent liveEvent starts

      let canAutoActivate = !isForSubChain;
      if (parentLiveEventHasNonAddRunMode) {
        // If the parent liveEvent is already running, start the subChain immediately
        canAutoActivate = true;
      }

      // TODO needs parentChainId
      const newChainState: ItemState<"chains"> = { id: chainId, liveEventIds: [], canAutoActivate, parentChainId };
      addItem({ id: chainId, type: "chains", state: newChainState }, () => {});
    }

    const newDuplicateLiveEventsMap: Record<string, EventBlock> = {};

    const eventsWithoutDuplicates = events.filter((event) => {
      const liveId = event.options.liveId ?? _makeLiveIdFromEventBlock(event);
      if (getItemWillExist("liveEvents", liveId)) {
        newDuplicateLiveEventsMap[liveId] = event;
        return false;
      }
      return true;
    });

    const newLiveIds = [] as string[];
    eventsWithoutDuplicates.forEach((event, index) => {
      const eventOptions = event.options;
      const chainId = listOptions.chainId ?? eventOptions.chainId; // NOTE I think this aleways has to be the same
      if (!chainId) return console.warn(`no chainId found for ${event.group}.${event.name}`), {};
      const eventWithNewOptions = { ...event, options: { ...event.options, chainId } };
      const liveId = eventOptions.liveId ?? _makeLiveIdFromEventBlock(eventWithNewOptions);
      newLiveIds.push(liveId);
      const eventWithLiveId = { ...eventWithNewOptions, options: { ...eventWithNewOptions.options, liveId } };
      addItem({ id: liveId, type: "liveEvents", state: _makeLiveEventStateFromEvent(eventWithLiveId) });
    });

    whenSettingStates(() => {
      const chainState = getState("chains", chainId);

      // NOTE make sure the chain is added before setting the chain state
      if (!chainState) return console.warn(`chain ${chainId} doesn't exist`), {};

      const nowChainEventIds = chainState.liveEventIds;
      const newChainEventIds = listOptions.hasPriority
        ? getInsertEventIdsAfterActive(getState_OLD(), nowChainEventIds, newLiveIds)
        : [...nowChainEventIds, ...newLiveIds];

      setState("chains.liveEventIds", newChainEventIds, chainId);
      setState(
        "chains.duplicateEventsToAdd",
        { ...chainState.duplicateEventsToAdd, ...newDuplicateLiveEventsMap },
        chainId
      );

      // If events are added to a subChain, set the goalEndTime for the parent event to Infinity, to wait for the subChain to finish
      if (isForSubChain) {
        setState("liveEvents.goalEndTime", Infinity, chainId);
        if (parentLiveEventHasNonAddRunMode && parentLiveEventRunMode !== "start") {
          forEach(newChainEventIds, (liveId) => {
            setState("liveEvents.nowRunMode", "add", liveId);
          });
        }
      }

      const liveEventsToCancel = Object.keys(chainState.duplicateEventsToAdd);
      liveEventsToCancel.forEach((liveId) => {
        const event = chainState.duplicateEventsToAdd[liveId];
        const eventState = getState("liveEvents", liveId);
        if (!eventState) return console.warn(`no liveEvent found for ${liveId}`);
        setState("liveEvents.nowRunMode", "cancel", liveId);
      });
    });
  };
  if (isForSubChain && getItemWillExist("liveEvents", liveId)) {
    // If its a subChain, add it immediately, since the parent liveEvent is already running
    addTheLiveEvents();
  } else {
    onNextTick(addTheLiveEvents);
  }
  return chainId;

  // NOTE events are auto started by the chain after the liveEventIds are set
}

export function _addEvent(event: EventBlockBase, options: EventBlockOptions) {
  const eventBlock: EventBlock = { ...event, options };
  const newChainId = _addEvents([eventBlock], { ...options, liveId: undefined }); // remove the liveId options for all the events, otherwise they will be counted as sub events
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
  const foundSubChains: string[] = [];
  const liveIdsByChain: Record<string, string[]> = {};
  let allFoundLiveIds = targetLiveIds ?? [];
  if (chainId && targetLiveIds) {
    liveIdsByChain[chainId] = [...targetLiveIds];
  } else if (chainId && !targetLiveIds) {
    const chainState = state.chains[chainId];
    targetLiveIds = chainState?.liveEventIds;
    allFoundLiveIds = targetLiveIds ?? [];
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

  for (const liveId of allFoundLiveIds) {
    // check if there's a chain with the same id as the liveId, meaning it's a subChain
    if (getItemWillExist("chains", liveId)) foundSubChains.push(liveId);
  }

  // add the liveIds of the subChains
  for (const subChainId of foundSubChains) {
    const subChainState = state.chains[subChainId];
    const subChainLiveIds = subChainState?.liveEventIds;
    if (!subChainLiveIds) return {}; // `no liveEventIds found for chain ${subChainId}`
    liveIdsByChain[subChainId] = [...subChainLiveIds];
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
    const loopedChainIsSubChain = getItemWillExist("liveEvents", chainId);
    // if the chain is a subChain, and any of the child live events were changed to something other than "add", set canAutoActivate to true
    let newCanAutoActivate = state.chains[chainId]?.canAutoActivate;
    if (loopedChainIsSubChain) {
      newCanAutoActivate = targetChainLiveIds.some((id: string) => newPartialLiveEventsState[id]!.nowRunMode !== "add");
    }

    // newPartialChainsState[chainId] = { liveEventIds: newChainLiveEventIds, canAutoActivate: newCanAutoActivate };
  }

  return { liveEvents: newPartialLiveEventsState, chains: newPartialChainsState };
}
