import { AllState, ItemType } from "repond";
import { TimePathArray } from "./types";

export const repondEventsMeta = {
  defaultElapsedTimePath: null as null | TimePathArray<any, any>,
  allEventTypeGroups: {} as Record<string, Record<string, any>>,
  defaultChainName: "defaultChain",
  eventTickCount: 0, // used to make sure events are considered in the order they were added, NOTE only used in refs currently and not state, since it shouldn't be loaded and saved, it's only meant to compare things hsort term before the frame finishes running, to deal with sequantial functino calls beofre the repond frame has run
};
