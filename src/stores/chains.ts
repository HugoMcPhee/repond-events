import { InitialItemsState } from "repond";
import { EventInstance } from "../types";

// Chains for running events in order

function getDefaultState() {
  return {
    id: "", // chainId, this name is replaced when addign a chain
    liveEventIds: [] as string[], // the chain of event nodettes , ["showSpeech_abcd", "wait_abcd"]. when it's empty, the chain'sRemoved
    // addTime?
    canAutoActivate: true, // whether events in the chain can be auto started, starts as false for addSubEvents, and can be set to true to activate
    duplicateEventsToAdd: {} as Record<string, EventInstance>, // if an event is added, but the liveId already exists, it's added here, and that liveEvent will be canceled , once that event is removed, this event will be added to the end of the chain
  };
}

const getDefaultRefs = () => ({});

const startStates = {} as InitialItemsState<typeof getDefaultState>;

export const chainsStore = { getDefaultState, getDefaultRefs, startStates };
