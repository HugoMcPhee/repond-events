// this exports internal events like "runEvents"

import { onNextTick, setState } from "repond";
import { makeEventTypes, makeValue } from "../";
import { cancelFastChain, chainDo } from "../helpers";
import { repondEventsMeta } from "../meta";
import { resolveNearestGetEventValue } from "../valueHelpers";
import { setVariable } from "../variableHelpers";

export const basicEvents = makeEventTypes(({ event }) => ({
  wait: event({
    run: ({ duration }, { runMode, liveId, elapsedTime }) => {
      // if (runMode === "add") console.log("wait added");

      if (runMode === "start") setState(`liveEvents.goalEndTime`, elapsedTime + duration, liveId);
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
    run: ({ prop, newValue, itemId }, { runMode, isFirstStart }) => {
      if (isFirstStart) onNextTick(() => setState(prop, newValue, itemId));
    },
    params: {
      prop: "default" as Parameters<typeof setState>[0],
      newValue: undefined as unknown as Parameters<typeof setState>[1],
      itemId: undefined as Parameters<typeof setState>[2],
    },
    isParallel: false,
  }),
  setVariable: event({
    run: ({ name, value, scope }, { isFast, isFirstStart }) => {
      if (isFirstStart) setVariable(name, value, scope, { isFast });
    },
    params: { name: "", value: "", scope: makeValue("basic", "getMyChainId", {}) as unknown as string | undefined },
    isParallel: false,
  }),
  returnValue: event({
    run: ({ value }, { isFirstStart, chainId, isFast }) => {
      // if isFast is fasle, return a promise, that resolves the value
      // if isFast is true, return the value

      if (!isFast) {
        return new Promise((resolve) => {
          if (isFirstStart) {
            const getEventValueChainId = resolveNearestGetEventValue(chainId, value);
            if (getEventValueChainId) {
              chainDo("cancel", getEventValueChainId);
            }
          }
        });
      } else {
        const fastChainMeta = repondEventsMeta.fastChain;
        fastChainMeta.foundFastReturnValue = value;
        const { getEventValueChainId } = fastChainMeta;
        if (getEventValueChainId) cancelFastChain(getEventValueChainId);
        fastChainMeta.getEventValueChainId = undefined;
      }
    },
    params: { value: undefined as any },
  }),
}));
