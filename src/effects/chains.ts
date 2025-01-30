import { breakableForEach, forEach } from "chootils/dist/loops";
import {
  ItemState,
  getItemWillExist,
  getState,
  getState_OLD,
  makeEffects,
  removeItem,
  setState,
  whenSettingStates,
} from "repond";
import { getActiveEventIds } from "../internal";
import { repondEventsMeta } from "../meta";

export const chainEffects = makeEffects(({ itemEffect, effect }) => ({
  whenLiveEventIdsChange: itemEffect({
    run: ({ itemId: chainId }) => {
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
        const { liveEventIds } = getState("chains", chainId) ?? {};

        let idsToActivate: string[] = getActiveEventIds(getState_OLD(), liveEventIds ?? []);

        let partialLiveEventsState: Record<string, Partial<ItemState<"liveEvents">>> = {};
        let partialChainsState: Record<string, Partial<ItemState<"chains">>> = {};

        if (isSubChain) {
          let foundNonAddEvent = false;

          breakableForEach(idsToActivate, (id) => {
            const loopedRunMode = getState("events", id)?.nowRunMode;
            if (loopedRunMode && loopedRunMode !== "add") {
              foundNonAddEvent = true;
              return true; // break
            }
          });
          if (foundNonAddEvent) {
            partialChainsState[chainId] = { canAutoActivate: true };
          }
        }
        // Return if the chain can't or wont be able to auto activate
        if (!canAutoActivate && !partialChainsState[chainId]?.canAutoActivate) {
          return;
        }

        if (!liveEventIds?.length) {
          if (isSubChain) {
            // If it's a sub chain, finish the parent liveEvent
            return { liveEvents: { [chainId]: { goalEndTime: 0 } } };
          }
          return {};
        }

        breakableForEach(idsToActivate, (id) => {
          const liveEventState = getState("liveEvents", id);

          if (!liveEventState) return;

          const { runModeOptionsWhenReady } = liveEventState;
          if (runModeOptionsWhenReady) {
            const { runMode, runBy } = runModeOptionsWhenReady;
            partialLiveEventsState[id] = { nowRunMode: runMode, runBy: runBy ?? null, runModeOptionsWhenReady: null };
          } else {
            partialLiveEventsState[id] = { nowRunMode: "start" };
          }
        });

        // Loop through all the new partial events, if any of them have a subChain, set the chain to canAutoActivate
        forEach(Object.keys(partialLiveEventsState), (liveId) => {
          const loopedEventHasSubChain = getItemWillExist("chains", liveId);
          if (loopedEventHasSubChain) {
            partialChainsState[liveId] = { canAutoActivate: true };
          }
        });

        return { liveEvents: partialLiveEventsState, chains: partialChainsState };
      });
    },
    check: { type: "chains", prop: ["liveEventIds", "canAutoActivate"] },
    step: "eventUpdates",
  }),
}));
