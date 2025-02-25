import { getState } from "repond";
import { repondEventsMeta } from "./meta";
import { ChainId, EvaluateParamsInfo, ParamMap, RawValue, ValueBlock, ValueRunInfo } from "./types";

function isValueBlock(value: any): value is ValueBlock {
  return value && typeof value === "object" && value.type === "value" && "group" in value && "name" in value;
}

export function evaluateValue(
  rawValue: RawValue | ValueBlock,
  valueRunInfo: ValueRunInfo,
  options: { isFast?: boolean } = {}
): RawValue | Promise<RawValue> {
  if (typeof rawValue !== "object" || rawValue === null) {
    return rawValue;
  }

  if (isValueBlock(rawValue)) {
    return evaluateValueBlock(rawValue, valueRunInfo);
  }

  return rawValue;
}

function getValueRunInfoForParam(info: EvaluateParamsInfo, key: string): ValueRunInfo {
  return {
    addedBy: info.addedBy,
    runBy: info.runBy,
    parentChainId: info.parentChainId,
    valueId: `${info.valueIdBase}.${key}`,
  };
}

function getEvaluateParamsInfoFromValueRunInfo(valueRunInfo: ValueRunInfo): EvaluateParamsInfo {
  return {
    addedBy: valueRunInfo.addedBy,
    runBy: valueRunInfo.runBy,
    parentChainId: valueRunInfo.parentChainId,
    valueIdBase: valueRunInfo.valueId,
  };
}

/*
This is used in for EventBlock params, and ValueBlock params,
to evaluate the params and return a new object with the evaluated values.
it requires a valueIdBase to be passed in, which is the base of the valueId, (valueIdBase + paramName)
*/
export function evaluateParams(params: ParamMap, info: EvaluateParamsInfo): ParamMap | Promise<ParamMap> {
  const paramEntries = Object.entries(params ?? {});
  const evaluatedEntries = paramEntries.map(([key, value]) => {
    const valueRunInfo = getValueRunInfoForParam(info, key);
    const evaluatedValue = evaluateValue(value, valueRunInfo);
    return [key, evaluatedValue];
  });

  const hasAsyncParam = evaluatedEntries.some(([, value]) => value instanceof Promise);

  if (hasAsyncParam) {
    return Promise.all(
      evaluatedEntries.map(async ([key, value]) => {
        const resolvedValue = await value;
        return [key, resolvedValue];
      })
    ).then((resolvedEntries) => {
      return Object.fromEntries(resolvedEntries);
    });
  } else {
    return Object.fromEntries(evaluatedEntries);
  }
}

export function evaluateValueBlock(valueBlock: ValueBlock, valueRunInfo: ValueRunInfo): RawValue | Promise<RawValue> {
  const valueDefinition = repondEventsMeta.allValueTypeGroups[valueBlock.group]?.[valueBlock.name];
  if (!valueDefinition) {
    throw new Error(`Value definition not found: ${valueBlock.group}.${valueBlock.name}`);
  }

  const paramsInfo = getEvaluateParamsInfoFromValueRunInfo(valueRunInfo);
  const paramsWithDefaults = { ...valueDefinition.params, ...valueBlock.params };
  const evaluatedParamsOrPromise = evaluateParams(paramsWithDefaults, paramsInfo);

  // NOTE this won't be possible anymore, since there's no async values
  if (evaluatedParamsOrPromise instanceof Promise) {
    return evaluatedParamsOrPromise.then((evaluatedParams) => {
      const result = valueDefinition.run(evaluatedParams, valueRunInfo, valueBlock);
      return result;
    });
  } else {
    const result = valueDefinition.run(evaluatedParamsOrPromise, valueRunInfo, valueBlock);
    return result;
  }
}

// Search up chains until it finds one that's in the resolveValueMap
// For non fast mode
export function resolveNearestGetEventValue(initialChainId: ChainId, value: any) {
  let chainId: string | null = initialChainId;
  let didResolve = false;
  while (chainId) {
    const chainState = getState("chains", chainId);
    if (chainState && chainId in repondEventsMeta.resolveValueMap) {
      repondEventsMeta.resolveValueMap[chainId]?.(value);
      didResolve = true;
      break;
    }
    chainId = chainState ? chainState.parentChainId : null;
  }

  return didResolve ? chainId : null;
}
