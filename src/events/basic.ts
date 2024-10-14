// this exports internal events like "runEvents"

import { onNextTick, setState } from "repond";
import { addSubEvents, makeEventTypes, setLiveEventState, todo } from "repond-events";
import { setVariable } from "repond-events/src/variableHelpers";

export const basicEvents = makeEventTypes(({ event }) => ({
  wait: event({
    run: ({ duration }, { runMode, liveId, elapsedTime }) => {
      // if (runMode === "add") console.log("wait added");

      if (runMode === "start") setLiveEventState(liveId, { goalEndTime: elapsedTime + duration });
    },
    params: { duration: 1000 },
    isParallel: false,
  }),
  log: event({
    run: ({ text }, { runMode, liveId, isFirstStart }) => {
      // if (runMode === "add") console.log("log added");
      if (isFirstStart) console.log(text);
    },
    params: { text: "" },
    isParallel: false,
  }),
  setState: event({
    run: ({ state }, { runMode, isFirstStart }) => {
      if (isFirstStart) onNextTick(() => setState(state));
    },
    params: { state: {} as Parameters<typeof setState>[0] },
    isParallel: false,
  }),
  setVariable: event({
    run: ({ name, value, scope }, { isFast, isFirstStart }) => {
      if (isFirstStart) setVariable(name, value, scope, { isFast });
    },
    params: { name: "", value: "", scope: "" },
    isParallel: false,
  }),
}));
