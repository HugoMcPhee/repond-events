import { breakableForEach } from "chootils/dist/loops";
import { getState, makeEffects, removeItem, setState } from "repond";
import { getActiveEventIds } from "../internal";
import { ItemState } from "../types";

export const chainEffects = makeEffects(({ itemEffect, effect }) => ({
  whenLiveEventIdsChange: itemEffect({
    run: ({ itemState, itemRefs, itemId, newValue: liveEventIdsNow }) => {
      const latestState = getState().chains[itemId];
      if (!latestState) return;
      const liveEventIds = latestState.liveEventIds;

      // Remove the chain if there's no liveEventIds left in the chain
      if (liveEventIds.length === 0) {
        removeItem({ type: "chains", id: itemId });
      }

      // Check which events should be active
      setState((state) => {
        let idsToActivate: string[] = getActiveEventIds(state, liveEventIds);

        if (idsToActivate.length === 0) return {};

        let partialLiveEventsState: Record<string, Partial<ItemState<"liveEvents">>> = {};

        breakableForEach(idsToActivate, (id) => {
          const liveEventState = state.liveEvents[id];

          if (!liveEventState) return;

          const { runModeOptionsWhenReady } = liveEventState;
          if (runModeOptionsWhenReady) {
            const { runMode, runBy } = runModeOptionsWhenReady;
            partialLiveEventsState[id] = { nowRunMode: runMode, runBy: runBy ?? null, runModeOptionsWhenReady: null };
          } else {
            partialLiveEventsState[id] = { nowRunMode: "start" };
          }
        });

        return { liveEvents: partialLiveEventsState };
      });
    },
    check: { type: "chains", prop: "liveEventIds" },
    step: "eventUpdates",
  }),
}));
