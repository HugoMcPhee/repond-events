import { forEach } from "chootils/dist/loops";
import {
  getPrevState,
  getRefs,
  getState,
  makeEffects,
  makeParamEffects,
  setState,
  startParamEffect,
  stopParamEffect,
  whenSettingStates,
} from "repond";
import { _addEvents, finalizeEvent, getElapsedTime, getEventTypeDefinition, runEventHandler } from "../internal";
import { repondEventsMeta } from "../meta";
import { EventBlock } from "../types";

export const liveEventEffects = makeEffects((then) => ({
  whenLiveEventAddedOrRemoved: then(
    (_, diffInfo) => {
      const addedLiveIds = diffInfo.itemsAdded.liveEvents;
      const removedLiveIds = diffInfo.itemsRemoved.liveEvents;

      forEach(addedLiveIds, (liveId) => startParamEffect("liveEvent", "whenElapsedTimeChanges", { liveId }));
      forEach(removedLiveIds, (liveId) => {
        stopParamEffect("liveEvent", "whenElapsedTimeChanges", { liveId });
        // Check if the liveIds chain had
        const chainId: string = getPrevState("liveEvents", liveId)?.chainId;

        if (!chainId) return;
        const chainState = getState("chains", chainId);
        if (!chainState) return; // ("no chainState found", chainId);
        const { duplicateEventsToAdd } = chainState;
        const duplicateEvent: EventBlock | undefined = duplicateEventsToAdd[liveId];
        if (!duplicateEvent) return;
        console.log("found duplicateEvent", liveId, chainId);
        _addEvents([duplicateEvent], { chainId });

        if (!duplicateEvent) return;
        whenSettingStates(() => {
          const latestChainState = getState("chains", chainId);
          const nowDuplicateEventsToAdd = latestChainState.duplicateEventsToAdd;
          const newDuplicateEventsToAdd = { ...nowDuplicateEventsToAdd };
          delete newDuplicateEventsToAdd[liveId];
          setState(`chains.duplicateEventsToAdd`, newDuplicateEventsToAdd, chainId);
        });

        // onNextTick
      });
    },
    {
      changes: ["liveEvents.__added", "liveEvents.__removed"],
      atStepEnd: false,
      step: "eventUpdates",
      isPerItem: false,
    }
  ),
  whenNowRunModeChanges: then(
    (liveId) => {
      const itemState = getState("liveEvents", liveId) ?? {};
      const { nowRunMode: latestRunMode } = itemState;
      const prevRunMode = getPrevState("liveEvents", liveId)?.nowRunMode;

      const nowTime = Date.now();
      const { addTime } = itemState;
      // console.log(liveId, prevRunMode, ">", latestRunMode);

      // function setLiveState(state: Partial<typeof itemState>, callback?: () => void | undefined) {
      //   return setState({ liveEvents: { [liveId]: state } }, callback);
      // }

      let runMode = latestRunMode;

      if (runMode === "unpause" || runMode === "unsuspend") {
        // Don't return early here, since we need to set the resumeTime before running the event handler lower down
        // NOTE liveInfo will have "isUnfreezing: true" if the unpause/unsuspendTime is the same as the relevant time for the nowRunType

        const isUnpausing = runMode === "unpause";
        runMode = (isUnpausing ? itemState.runModeBeforePause : itemState.runModeBeforeSuspend) ?? "start";
        whenSettingStates(
          () => {
            // Set the goalEndTime to the elapsedTime + remainingTime ( old goalEndTime - pauseTime )
            const liveEventState = getState("liveEvents", liveId);
            if (!liveEventState) return;
            const { goalEndTime, pauseTime } = liveEventState;
            if (goalEndTime === null || pauseTime === null) return;
            const remainingTime = goalEndTime - pauseTime;
            const elapsedTime = getElapsedTime(liveEventState.chainId);

            setState(`liveEvents.goalEndTime`, elapsedTime + remainingTime, liveId);
            setState(`liveEvents.unpauseTime`, nowTime, liveId);
            setState(`liveEvents.nowRunMode`, runMode, liveId);
            setState(`liveEvents.runModeBeforePause`, isUnpausing ? null : liveEventState.runModeBeforePause, liveId);
            setState(
              `liveEvents.runModeBeforeSuspend`,
              isUnpausing ? liveEventState.runModeBeforeSuspend : null,
              liveId
            );
          }
          // () => runEventHandler(liveId) // don't run the event handler here, since it's run later
        );
      }

      if (runMode === null) return console.warn("no runType found", runMode), undefined;
      if (runMode === "add") {
        setState(`liveEvents.addTime`, nowTime, liveId);
        runEventHandler(liveId);
        return;
      }
      if (!addTime) return console.warn("run type changed while not added", runMode), undefined;

      if (runMode === "start") {
        const liveEvent = getState("liveEvents", liveId);
        const startTime = liveEvent.startTime;
        let newGoalEndTime = liveEvent.goalEndTime;

        // NOTE the way eventHandler calculates isFirstStart is by using isUnfreezing, but here it's simpler
        const isFirstStart = startTime === null;

        if (isFirstStart) {
          const eventType = getEventTypeDefinition(liveEvent.event.group, liveEvent.event.name);

          const foundElapsedTime = getElapsedTime(liveId);
          const foundDuration = liveEvent.duration ?? eventType.duration;

          if (foundDuration != null && foundElapsedTime != null && isFirstStart) {
            newGoalEndTime = foundElapsedTime + foundDuration * 1000;
          }
        }

        setState(`liveEvents.startTime`, nowTime, liveId);
        setState(`liveEvents.goalEndTime`, newGoalEndTime, liveId);
        runEventHandler(liveId);
        return;
      }
      if (runMode === "pause") {
        setState(`liveEvents.pauseTime`, nowTime, liveId);
        setState(`liveEvents.runModeBeforePause`, prevRunMode, liveId);
        runEventHandler(liveId);
        return;
      }

      if (runMode === "suspend") {
        setState(`liveEvents.suspendTime`, nowTime, liveId);
        setState(`liveEvents.runModeBeforeSuspend`, prevRunMode, liveId);
        runEventHandler(liveId);
        return;
      }

      if (runMode === "skip" || runMode === "cancel" || runMode === "end") {
        runEventHandler(liveId);
        finalizeEvent(liveId);
      }
    },
    {
      changes: ["liveEvents.nowRunMode"],
      atStepEnd: false, // NOTE may need to set runType in onNextTick so all other effects can see it changed
      runAtStart: true,
      step: "eventUpdates",
    }
  ),
}));

// We want to start a param effect when a liveEvent starts, and stop it when the liveEvent ends (is removed)
export const liveEventParamEffects = makeParamEffects({ liveId: "" }, (then, params) => {
  const defaultReturn = {
    whenElapsedTimeChanges: then(() => console.warn("no timePath", elapsedTimePath), {
      changes: ["liveEvents.__added", "liveEvents.__removed"],
      isPerItem: false,
    }),
  };

  const { liveId } = params;

  const elapsedTimePath = getState("liveEvents", liveId)?.elapsedTimePath ?? repondEventsMeta.defaultElapsedTimePath;

  if (!elapsedTimePath) return console.warn("no elapsedTimePath", liveId), defaultReturn;
  const timePathType = elapsedTimePath[0];
  const timePathId = elapsedTimePath[1];
  const timePathProp = elapsedTimePath[2];
  if (!timePathType || !timePathId || !timePathProp) {
    console.warn("timePath not set", elapsedTimePath);
    return defaultReturn;
  }

  return {
    whenElapsedTimeChanges: then(
      () => {
        const elapsedTime = (getState(timePathType, timePathId) as any)?.[timePathProp];
        if (elapsedTime === undefined) return;
        const liveEventState = getState("liveEvents", liveId);
        const liveEventRefs = getRefs("liveEvents", liveId);
        if (!liveEventState || !liveEventRefs) return;
        const { goalEndTime, startTime, nowRunMode } = liveEventState;
        if (
          nowRunMode === "end" ||
          nowRunMode === "pause" ||
          nowRunMode === "suspend" ||
          nowRunMode === "cancel" ||
          nowRunMode === "skip" ||
          nowRunMode === "add"
        )
          return;
        if (startTime === null) return;
        if (goalEndTime === null) return console.warn("no goalEndTime", liveEventState), undefined;
        if (elapsedTime >= goalEndTime) {
          setState(`liveEvents.nowRunMode`, "end", liveId);
          stopParamEffect("liveEvent", "whenElapsedTimeChanges", { liveId }); // stop this effect from running
        }
      },
      {
        changes: [`${timePathType}.${timePathProp}`],
        itemIds: [timePathId],
        step: "eventUpdates",
        isPerItem: false,
      }
    ),
  };
});
