import { InitialItemsState } from "repond";

// Chains for running events in order

function state() {
  return {
    id: "", // chainId, this name is replaced when addign a chain
    liveEventIds: [] as string[], // the chain of event nodettes , ["showSpeech_abcd", "wait_abcd"]. when it's empty, the chain'sRemoved
    // addTime?
  };
}

const refs = () => ({});

const startStates = {} as InitialItemsState<typeof state>;

export const chains = { state, refs, startStates };
