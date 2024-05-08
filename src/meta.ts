import { StatePath } from "repond";
import { ChainId } from "./types";

export const repondEventsMeta = {
  defaultElapsedTimePath: null as null | StatePath<any>,
  allEventTypeGroups: {} as Record<string, Record<string, any>>,
  defaultChainId: null as null | ChainId,
};
