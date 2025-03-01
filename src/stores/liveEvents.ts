import { StatePath } from "repond";
import { EventBlockBase, ParamMap, RunMode, RunModeOptions } from "../types";

export const liveEventsStore = {
  newState: () => ({
    id: "", // liveId - this is the unique id for the live event e.g "music_play_abcd"
    chainId: "", // could read shared things form here?
    event: { group: "music", name: "play", params: {} } as EventBlockBase, // duration can be stored in the event
    evaluatedParams: null as null | ParamMap, // the evaluated params, stored here so it can be used in the event handler
    isParallel: false, // if it should run in parallel with other events
    duration: null, // the duration option provided, only set from options and used when the event starts
    addedBy: null as null | string, // incase it's useful to know where an event was added from (for multiplayer or if it was added automatically etc)
    runBy: null as null | string, // an optional string to identify who is ran the runMode the event, e.g "player1" or "saveGame"
    // Run types
    nowRunMode: null as RunMode | null, // when this changes, the run handler runs
    runModeOptionsWhenReady: null as RunModeOptions | null, // the run type it should do instead of start when it's ready, for now only "skip"
    runModeBeforePause: null as RunMode | null, // store the runMode before it was paused, so it can be resumed
    runModeBeforeSuspend: null as RunMode | null, // store the runMode before it was suspended, so it can be resumed
    // Times - note all are relative to the elpasedTime path time
    addTime: null as null | number, // when it was added
    readyTime: null as null | number, // when it's ready to start, when its finished waiting in the chain
    startTime: null as null | number, // this is so when skipping a chain, it can act differently depending on if it started or directly skipped
    goalEndTime: 0 as number, // the current elapsed time + the duration, can be set to Infinity to wait until skipped
    pauseTime: null as null | number, //
    suspendTime: null as null | number, //
    unpauseTime: null as null | number, // when resuming, recalculate the new goalEndTime by adding remainingTime to nowTime (remainingTime is difference between the pauseTime and the old goalEndTime),
    unsuspendTime: null as null | number, // when resuming, recalculate the new goalEndTime by adding remainingTime to nowTime (remainingTime is difference between the pauseTime and the old goalEndTime),
    //
    elapsedTimePath: null as null | StatePath<any>, // repond state path [item,id,prop] for elapsedTime state, uses the default if not set here
  }),
  newRefs: () => ({}),
};
