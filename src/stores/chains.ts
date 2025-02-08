import { EventBlock } from "../types";

// Chains for running events in order

export const chainsStore = {
  newState: () => ({
    id: "", // chainId, this name is replaced when addign a chain
    liveEventIds: [] as string[], // the chain of event nodettes , ["showSpeech_abcd", "wait_abcd"]. when it's empty, the chain'sRemoved
    //
    // WIP TODO: update parentChainId when this chain is created if it's a subchain
    parentChainId: "", // if this chain is a subchain, then this is the parent chainId
    // addTime?
    canAutoActivate: true, // whether events in the chain can be auto started, starts as false for addSubEvents, and can be set to true to activate
    duplicateEventsToAdd: {} as Record<string, EventBlock>, // if an event is added, but the liveId already exists, it's added here, and that liveEvent will be canceled , once that event is removed, this event will be added to the end of the chain
    //
    variablesByName: {} as Record<string, any>, // variables that are set in the chain
  }),
  newRefs: () => ({}),
};
