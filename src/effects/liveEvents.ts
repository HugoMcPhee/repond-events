import { forEach } from "chootils/dist/loops";
import { getRefs, getState, makeEffects, makeParamEffects, setState, startParamEffect, stopParamEffect } from "repond";
import { finalizeEvent, getElapsedTime, runEventHandler } from "../internal";
import { repondEventsMeta } from "../meta";

export const liveEventEffects = makeEffects(({ itemEffect, effect }) => ({
  whenLiveEventAddedOrRemoved: effect({
    run: (diffInfo) => {
      const addedLiveIds = diffInfo.itemsAdded.liveEvents;
      const removedLiveIds = diffInfo.itemsRemoved.liveEvents;

      forEach(addedLiveIds, (liveId) => startParamEffect("liveEvent", "whenElapsedTimeChanges", { liveId }));
      forEach(removedLiveIds, (liveId) => stopParamEffect("liveEvent", "whenElapsedTimeChanges", { liveId }));
    },
    check: { type: "liveEvents", addedOrRemoved: true },
    atStepEnd: false,
    step: "eventUpdates",
  }),
  whenNowRunModeChanges: itemEffect({
    run: ({ itemState, itemId: liveId, newValue: latestRunMode, prevValue: prevRunMode }) => {
      const nowTime = Date.now();
      const { addTime } = itemState;
      // console.log(liveId, prevRunMode, ">", latestRunMode);

      function setLiveState(state: Partial<typeof itemState>, callback?: () => void | undefined) {
        return setState({ liveEvents: { [liveId]: state } }, callback);
      }

      let runMode = latestRunMode;

      if (runMode === "unpause" || runMode === "unsuspend") {
        // Don't return early here, since we need to set the resumeTime before running the event handler lower down
        // NOTE liveInfo will have "isUnfreezing: true" if the unpause/unsuspendTime is the same as the relevant time for the nowRunType

        const isUnpausing = runMode === "unpause";
        runMode = (isUnpausing ? itemState.runModeBeforePause : itemState.runModeBeforeSuspend) ?? "start";
        setState(
          (state) => {
            // Set the goalEndTime to the elapsedTime + remainingTime ( old goalEndTime - pauseTime )
            const liveEventState = state.liveEvents[liveId];
            if (!liveEventState) return;
            const { goalEndTime, pauseTime } = liveEventState;
            if (goalEndTime === null || pauseTime === null) return;
            const remainingTime = goalEndTime - pauseTime;
            const elapsedTime = getElapsedTime(liveEventState.chainId);
            return {
              liveEvents: {
                [liveId]: {
                  goalEndTime: elapsedTime + remainingTime,
                  unpauseTime: nowTime,
                  nowRunMode: runMode,
                  runModeBeforePause: isUnpausing ? null : liveEventState.runModeBeforePause,
                  runModeBeforeSuspend: isUnpausing ? liveEventState.runModeBeforeSuspend : null,
                },
              },
            };
          }
          // () => runEventHandler(liveId) // don't run the event handler here, since it's run later
        );
      }

      if (runMode === null) return console.warn("no runType found", runMode), undefined;
      if (runMode === "add") {
        setLiveState({ addTime: nowTime });
        runEventHandler(liveId);
        return;
      }
      if (!addTime) return console.warn("run type changed while not added", runMode), undefined;

      if (runMode === "start") {
        setLiveState({ startTime: nowTime });
        runEventHandler(liveId);
        return;
      }
      if (runMode === "pause") {
        setLiveState({ pauseTime: nowTime, runModeBeforePause: prevRunMode });
        runEventHandler(liveId);
        return;
      }

      if (runMode === "suspend") {
        setLiveState({ suspendTime: nowTime, runModeBeforeSuspend: prevRunMode });
        runEventHandler(liveId);
        return;
      }

      if (runMode === "skip" || runMode === "cancel" || runMode === "end") {
        runEventHandler(liveId);
        finalizeEvent(liveId);
      }
    },
    check: { type: "liveEvents", prop: "nowRunMode" },
    atStepEnd: false, // NOTE may need to set runType in onNextTick so all other effects can see it changed
    runAtStart: true,
    step: "eventUpdates",
  }),
}));

// We want to start a param effect when a liveEvent starts, and stop it when the liveEvent ends (is removed)
export const liveEventParamEffects = makeParamEffects({ liveId: "" }, ({ effect, params: { liveId } }) => {
  const defaultReturn = {
    whenElapsedTimeChanges: effect({
      run: () => console.warn("no timePath", elapsedTimePath),
      check: { type: "liveEvents", addedOrRemoved: true },
    }),
  };

  const elapsedTimePath = getState().liveEvents[liveId]?.elapsedTimePath ?? repondEventsMeta.defaultElapsedTimePath;

  if (!elapsedTimePath) return console.warn("no elapsedTimePath", liveId), defaultReturn;
  const timePathType = elapsedTimePath[0];
  const timePathId = elapsedTimePath[1];
  const timePathProp = elapsedTimePath[2];
  if (!timePathType || !timePathId || !timePathProp) {
    console.warn("timePath not set", elapsedTimePath);
    return defaultReturn;
  }

  return {
    whenElapsedTimeChanges: effect({
      run: () => {
        const elapsedTime = (getState() as any)?.[timePathType]?.[timePathId]?.[timePathProp];
        if (elapsedTime === undefined) return;
        const liveEventState = getState().liveEvents[liveId];
        const liveEventRefs = getRefs().liveEvents[liveId];
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
          setState({ liveEvents: { [liveId]: { nowRunMode: "end" } } });
          stopParamEffect("liveEvent", "whenElapsedTimeChanges", { liveId }); // stop this effect from running
        }
      },
      check: { type: timePathType, id: timePathId, prop: timePathProp as any },
      step: "eventUpdates",
    }),
  };
});
