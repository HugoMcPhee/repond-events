import { makeValueTypes, runEvents } from "../../helpers";
import { repondEventsMeta } from "../../meta";
import { EventBlock } from "../../types";
import { getVariable } from "../../variableHelpers";

export const basicValues = makeValueTypes(({ value }) => ({
  combine: value({
    run: ({ valueA, valueB }, { valueId, parentChainId }) => {
      return valueA + valueB;
    },
    params: { valueA: "", valueB: "" },
  }),
  string: value({
    run: ({ value }, {}) => {
      return value;
    },
    params: { value: "" },
  }),
  getVariable: value({
    run: ({ name, scope }, { isFast }) => {
      return getVariable(name, scope, { isFast });
    },
    params: {
      name: "",
      scope: { type: "value", group: "basic", name: "getMyChainId" } as unknown as string | undefined,
      // scope: makeValue("basic", "getMyChainId") as unknown as string | undefined,
    },
  }),
  getMyChainId: value({
    run: ({}, { parentChainId }) => parentChainId,
    params: {},
  }),
  // NOTE must pass parentChainId here for now to get scope? oh wait, it already has it from value run
  getEventValue: value({
    run: ({ events }, { parentChainId, valueId, isFast }) => {
      // pass the parentChainId , and set the new chainId as the valueId

      // Start a new promise, and store the resolve

      // TODO Make it return a promise if it's non fast mode, and do the fast way seperately

      if (!isFast) {
        return new Promise((resolve, reject) => {
          repondEventsMeta.resolveValueMap[valueId] = resolve;
          runEvents(events, { chainId: valueId, parentChainId });
          // if the chain finishes, it will also resolve
        });
      } else {
        runEvents(events, { chainId: valueId, parentChainId, isFast });
        repondEventsMeta.fastChain.getEventValueChainId = valueId;
        return repondEventsMeta.fastChain.foundFastReturnValue;
      }
    },
    params: { events: [] as EventBlock[] },
  }),
  //   getState: value({
  //     run: ({ statePath }, {}) => {
  //       if (isFirstStart) onNextTick(() => getState_OLD());
  //     },
  //     params: { statePath: {} as Parameters<typeof setState>[0] },
  //     isParallel: false,
  //   }),
}));
