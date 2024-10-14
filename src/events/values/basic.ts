import { getVariable } from "../../variableHelpers";
import { makeValueTypes } from "../../helpers";

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
    params: { name: "", scope: "" },
  }),
  //   getState: value({
  //     run: ({ statePath }, {}) => {
  //       if (isFirstStart) onNextTick(() => setState(state));
  //     },
  //     params: { statePath: {} as Parameters<typeof setState>[0] },
  //     isParallel: false,
  //   }),
}));
