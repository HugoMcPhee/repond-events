TODO

-

v0.2.2

- Support params based on other params!
- use ItemState from repond

v0.2.1

- Supports adding duplciate events to liveEvents, if an event with the same liveId is added to a chain, it will cancel the original event, and set the new event to be added at the end of the chain once the canceled event is removed
- Fixes checking isUnpausing and isUnsuspending in liveInfo which also fixes :
  - isUnfreezing
  - isFirstAdd
  - isFirstStart
  - isFirstPause
  - isFirstSuspend

v0.2.0

- Works with repond 0.16.0
- Removes the Events suffix only from the end of event names

v0.1.5

- Supports having sub chains for liveEvents, where when the subchain is finishes, the liveEvent finishes
  - Adding a "liveId" to runEvents options will make it subchain, or using addSubChain(liveId, events, otions
- Added "isFirstAdd" to liveInfo, to know if it's a the first time the liveEvent is added, since unpausing/unsuspending can cause the "add" handler to be called again, if the liveEvents runMode was "add" before pausing/suspending,
  - "isFirstAdd" can be used to add subEvents once
  - Also added "isFirstStart", "isFirstPause" and "isFirstSuspend" to liveInfo
- Supports setting a duration in live event options
- Exports some useful types from the library
- Removed liveState.goalRunModeOptions

v0.1.4

- Uses real value for didStart in liveInfo

v0.1.3

- Supports optionall loosely typing chainId
- removed unused meta.eventTickCount

v0.1.2

- Supports optional default chain id, so all new chains can get a random id

v0.1.1

- Removed some warnings since chainDo could be called on removed chains

v0.1.0

- First version!
