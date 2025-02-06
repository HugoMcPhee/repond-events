import { breakableForEach, forEach } from "chootils/dist/loops";
import { ItemState, getItemWillExist, getState, makeEffects, removeItem, setState, whenSettingStates } from "repond";
import { getActiveEventIds } from "../internal";
import { repondEventsMeta } from "../meta";

export const chainEffects = makeEffects((then) => ({
  whenLiveEventIdsChange: then(
    (chainId) => {
      const nowChainState = getState("chains", chainId);
      if (!nowChainState) return;
      const { liveEventIds: firstLiveEventIds, canAutoActivate } = nowChainState;
      const isSubChain = getItemWillExist("liveEvents", chainId);

      // Remove the chain if there's no liveEventIds left in the chain
      if (firstLiveEventIds.length === 0) {
        removeItem({ type: "chains", id: chainId });
        // if there's a getEventValue that was waiting for a returnValue in the chain, but the chain ended,
        // return null for the chain
        repondEventsMeta.resolveValueMap[chainId]?.(undefined);
      }

      // Check which events should be active
      whenSettingStates(() => {
        const chainState = getState("chains", chainId);
        if (!chainState) return; // NOTE maybe warn here

        const { liveEventIds } = chainState;

        let idsToActivate: string[] = getActiveEventIds(liveEventIds ?? []);

        // NOTE these are only for reference! we don't use this to set state directly
        let newLiveEventsState: Record<string, Partial<ItemState<"liveEvents">>> = {};
        let newChainsState: Record<string, Partial<ItemState<"chains">>> = {};

        if (isSubChain) {
          let foundNonAddEvent = false;

          breakableForEach(idsToActivate, (id) => {
            const loopedRunMode = getState("events", id)?.nowRunMode;
            if (!loopedRunMode) {
              console.log("no loopedRunMode: id", id);
            }
            if (loopedRunMode && loopedRunMode !== "add") {
              foundNonAddEvent = true;
              return true; // break
            }
          });
          if (foundNonAddEvent) {
            newChainsState[chainId] = { canAutoActivate: true };
            setState("chains.canAutoActivate", true, chainId);
          }
        }

        // Return if the chain can't or wont be able to auto activate
        if (!canAutoActivate && !newChainsState[chainId]?.canAutoActivate) {
          return;
        }

        if (!liveEventIds?.length) {
          if (isSubChain) {
            // If it's a sub chain, finish the parent liveEvent
            // return { liveEvents: { [chainId]: { goalEndTime: 0 } } };
            setState("liveEvents.goalEndTime", 0, chainId);
            // Set state then exit
            return;
          }

          // Only exit
          return;
        }

        breakableForEach(idsToActivate, (id) => {
          const liveEventState = getState("liveEvents", id);

          if (!liveEventState) return;

          const { runModeOptionsWhenReady } = liveEventState;
          if (runModeOptionsWhenReady) {
            const { runMode, runBy } = runModeOptionsWhenReady;
            newLiveEventsState[id] = { nowRunMode: runMode, runBy: runBy ?? null, runModeOptionsWhenReady: null };
            setState("liveEvents.nowRunMode", runMode, id);
            setState("liveEvents.runBy", runBy ?? null, id);
            setState("liveEvents.runModeOptionsWhenReady", null, id);
          } else {
            newLiveEventsState[id] = { nowRunMode: "start" };
            setState("liveEvents.nowRunMode", "start", id);
          }
        });

        // Loop through all the new partial events, if any of them have a subChain, set the chain to canAutoActivate
        forEach(Object.keys(newLiveEventsState), (liveId) => {
          const loopedEventHasSubChain = getItemWillExist("chains", liveId);
          if (loopedEventHasSubChain) {
            newChainsState[liveId] = { canAutoActivate: true };
            setState("chains.canAutoActivate", true, liveId);
          }
        });
      });
    },
    {
      changes: ["chains.liveEventIds", "chains.canAutoActivate"],
      step: "eventUpdates",
    }
  ),
}));
