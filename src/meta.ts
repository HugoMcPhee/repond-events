import { ChainId, TimePathArray } from "./types";

export const repondEventsMeta = {
  defaultElapsedTimePath: null as null | TimePathArray<any, any>,
  allEventTypeGroups: {} as Record<string, Record<string, any>>,
  defaultChainId: null as null | ChainId,
};
