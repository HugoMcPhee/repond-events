TODO

- v0.3.2
- Update repond to 1.2.0

- v0.3.1
- Update repond to 1.1.0

- v0.3.0
- Use repond 1.0.1!
- start adding values

- v0.2.9
- Fix types when not using emoji keys

- v0.2.7
- support emoji keys for event group names
- added 'E' alias to make an event ('todo' )

- v0.2.6
- Show a warning if an event type isn't found
- Allows individual events to overwrite isParallel, timePath and duration options (over of the runEvents options)
- Fixes setting a duration on a liveEvent to only apply when the liveEvent starts

- v0.2.5
- Renamed "toDo" to "todo" and exported an alias called "II"
- Added way to have optional individual params and whole params object
- Adds the default props from the event type definition

v0.2.4

- Better ids for runEvent
- Remove liveId from options in \_addEvent to prevent adding the event as a sub event

v0.2.3

- Support starting sub events instantly
  - Supports adding and starting sub events to a liveEvent that's already started
  - NOTE the part that checks if it's not add or start, that sets the runMode (e.g to pause or suspend) may need tweaking to run after the frist setState, so the 'add' handler can run before that 'pause' or 'suspend'

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
