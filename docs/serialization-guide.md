# Serialization Research - Repond Events

## Executive Summary

**YES** - The repond-events system is designed to be serializable, with important caveats:

✅ **Fully Serializable:**
- Chain states (IDs, event queues, variables)
- Live event instances (parameters, timing, metadata)
- Event parameters and evaluated values
- Variables (if using JSON-compatible types)
- Timing information (timestamps)

❌ **NOT Serializable:**
- Event handler functions (`run` methods)
- Value handler functions
- Metadata with function references

**Key Pattern:** Event/value definitions (with `run` functions) stay in code. Event/value *instances* (data only) are serializable.

---

## 1. What Can Be Serialized?

### 1.1 Chain States - FULLY SERIALIZABLE

**Location:** [src/stores/chains.ts](src/stores/chains.ts)

```typescript
export type ChainState = {
  id: string;                           // ✅ Serializable
  liveEventIds: string[];               // ✅ Serializable
  parentChainId: string;                // ✅ Serializable
  canAutoActivate: boolean;             // ✅ Serializable
  duplicateEventsToAdd: Record<...>;    // ✅ Serializable (plain objects)
  variablesByName: Record<string, any>; // ✅ Serializable (if values are JSON-compatible)
};
```

**Evidence:** All properties are primitive types or plain objects - no functions, closures, or non-serializable references.

### 1.2 Live Event States - FULLY SERIALIZABLE

**Location:** [src/stores/liveEvents.ts](src/stores/liveEvents.ts)

```typescript
export type LiveEventState = {
  id: string;                          // ✅ Serializable
  chainId: string;                     // ✅ Serializable
  event: EventBlockBase;               // ✅ Serializable (plain object)
  evaluatedParams: ParamMap;           // ✅ Serializable
  nowRunMode: RunMode;                 // ✅ Serializable (string literal)
  duration: number;                    // ✅ Serializable
  addTime: number;                     // ✅ Serializable (timestamp)
  startTime: number;                   // ✅ Serializable
  goalEndTime: number;                 // ✅ Serializable
  pauseTime: number;                   // ✅ Serializable
  suspendTime: number;                 // ✅ Serializable
  runTimesRan: RunModeToInfo;          // ✅ Serializable (plain object)
  timePath: StatePath;                 // ✅ Serializable (string | [string, string])
  // ... all other properties are primitives or plain objects
};
```

**Evidence:** Entire state is composed of primitives, arrays, and plain objects.

### 1.3 Event Blocks - FULLY SERIALIZABLE

**Location:** [src/types.ts](src/types.ts)

```typescript
export type EventBlockBase = {
  group: string;            // ✅ Serializable
  name: string;             // ✅ Serializable
  params?: ParamMap;        // ✅ Serializable (can contain ValueBlocks)
};

export type EventBlock = EventBlockBase & {
  options?: EventBlockOptions;  // ✅ Serializable (plain object)
};
```

**Evidence:** EventBlocks contain NO function references - only data.

### 1.4 Value Blocks - FULLY SERIALIZABLE

**Location:** [src/types.ts](src/types.ts)

```typescript
export type ValueBlockBase = {
  valueGroup: string;       // ✅ Serializable
  valueName: string;        // ✅ Serializable
  params?: ParamMap;        // ✅ Serializable (can be nested)
};
```

**Evidence:** ValueBlocks are plain data describing WHAT to compute, not HOW.

### 1.5 Variables - CONDITIONALLY SERIALIZABLE

**Location:** [src/stores/chains.ts](src/stores/chains.ts)

```typescript
variablesByName: Record<string, any>;
```

**Serializable IF:** Variable values are JSON-compatible (strings, numbers, booleans, arrays, plain objects)

**NOT Serializable IF:** Variables contain functions, DOM elements, class instances, etc.

**Developer Responsibility:** Ensure variables only contain serializable types.

---

## 2. What CANNOT Be Serialized?

### 2.1 Event Type Definitions

**Location:** [src/meta.ts](src/meta.ts)

```typescript
export const repondEventsMeta = {
  allEventTypeGroups: {} as Record<string, Record<string, EventTypeDefinition>>,
  // ... other metadata with functions
};
```

**Contains:**
- `run` functions for each event type
- Parameter evaluators
- Other runtime metadata

**Why Not Serializable:** Functions cannot be serialized to JSON.

**Solution:** Event type definitions must be re-registered via `initEventTypeGroups()` after deserialization.

### 2.2 Value Type Definitions

**Location:** [src/meta.ts](src/meta.ts)

```typescript
allValueTypeGroups: {} as Record<string, Record<string, ValueTypeDefinition>>,
```

**Same pattern as events** - definitions contain `run` functions that must be re-initialized.

### 2.3 Runtime Metadata

**Location:** [src/meta.ts](src/meta.ts)

```typescript
resolveValueMap: {} as Record<string, (value: any) => void>,
promiseMap: {} as Record<string, Promise<void>>,
```

**These are transient** - they exist only during runtime and are recreated as needed.

---

## 3. How Serialization Works

### 3.1 Architecture Pattern

**SEPARATION OF CONCERNS:**

```
┌─────────────────────────┐
│  Event Definitions      │  ← NOT serialized (stays in code)
│  (run functions)        │  ← Re-registered on app startup
└─────────────────────────┘

┌─────────────────────────┐
│  Event Instances        │  ← FULLY serialized
│  (data only)            │  ← Saved/restored as JSON
└─────────────────────────┘
```

**Pattern from** [src/internal.ts:141-143](src/internal.ts#L141-L143):
```typescript
// Event handlers are looked up by group:name at runtime
const eventTypeDefinition = meta.allEventTypeGroups[
  liveEventState.event.group
]?.[liveEventState.event.name];
```

### 3.2 Manual Serialization

**NO BUILT-IN UTILITIES** - Searched codebase for:
- `JSON.stringify` - Not found in source
- `serialize` - Not found
- `toJSON` - Not found
- `fromJSON` - Not found

**Developer must manually:**

```typescript
// 1. Serialize state
const chainsState = getAllState("chains");
const liveEventsState = getAllState("liveEvents");
const serialized = JSON.stringify({
  chains: chainsState,
  liveEvents: liveEventsState
});

// 2. Deserialize state
const data = JSON.parse(serialized);

// 3. Restore state
Object.entries(data.chains).forEach(([id, state]) => {
  setState("chains", state, id);
});
Object.entries(data.liveEvents).forEach(([id, state]) => {
  setState("liveEvents", state, id);
});
```

**Note:** `getAllState` is a hypothetical helper - actual implementation would use `getItemIds()` and iterate.

---

## 4. Can Restored Chains Continue Running?

### 4.1 YES - With Proper Setup

**Requirements:**

1. **Re-register event/value type definitions** via `initEventTypeGroups()` and `initValueTypeGroups()`
2. **Restore chain and liveEvent state** to Repond stores
3. **Restart effect groups** if needed (they should auto-continue)
4. **Handle timing gaps** if time passed during serialization

### 4.2 Timing Recalculation

**Location:** [src/effects/liveEvents.ts:80-97](src/effects/liveEvents.ts#L80-L97)

The system already handles timing recalculation on pause/resume:

```typescript
// On pause - save remaining time
const remainingTime = goalEndTime - pauseTime;

// On unpause - recalculate goal end time
const newGoalEndTime = currentElapsedTime + remainingTime;
```

**This same logic can handle serialization gaps:**
- `pauseTime` = time when serialized
- Resume = time when deserialized
- System automatically recalculates `goalEndTime` based on current elapsed time

### 4.3 Effect Groups Auto-Continue

**Location:** [src/effects/chains.ts](src/effects/chains.ts) and [src/effects/liveEvents.ts](src/effects/liveEvents.ts)

Effects watch for state changes:
- When chain state is restored, `whenLiveEventIdsChange` triggers
- When liveEvent state is restored, `whenNowRunModeChanges` triggers
- Events automatically activate and run based on restored state

**No special "resume" code needed** - the reactive effect system handles it.

---

## 5. Integration with Repond

### 5.1 Repond Stores Are Serializable

**Evidence from Repond integration:**

```typescript
// Access state (returns plain objects)
const chainState = getState("chains", chainId);
const liveEventState = getState("liveEvents", liveEventId);

// Get all IDs
const allChainIds = getItemIds("chains");
const allLiveEventIds = getItemIds("liveEvents");

// Iterate and serialize
const allChains = allChainIds.map(id => ({
  id,
  state: getState("chains", id)
}));
```

**Repond's store system uses plain objects** - fully compatible with JSON serialization.

### 5.2 Metadata Must Be Re-Initialized

**Pattern:**

```typescript
// On app startup (or after deserialization)
initEventTypeGroups(myEventGroups, { defaultTimePath: ["global", "time"] });
initValueTypeGroups(myValueGroups);

// Start effect groups
startEffectsGroup(repondEventsEffectGroups);
```

**Metadata is populated at initialization** - not from serialized state.

---

## 6. Limitations and Caveats

### 6.1 Event Handlers Cannot Be Serialized

**Implication:** Custom event types must be defined in compiled code and re-registered on startup.

**Cannot do:** Download new event type definitions from server at runtime (unless using eval/Function constructor - not recommended).

**Can do:** Download event *instances* (chains of events) that use pre-defined event types.

### 6.2 Timing Uses Absolute Timestamps

**From** [src/stores/liveEvents.ts](src/stores/liveEvents.ts):
```typescript
addTime: number;      // Date.now() when event added
startTime: number;    // Date.now() when event started
goalEndTime: number;  // When event should end
```

**Implication:** If significant real-world time passes between serialization and restoration, events may:
- Have already "ended" according to timestamps
- Need timing recalculation

**Mitigation:** The pause/unpause logic (section 4.2) handles this by recalculating based on elapsed time from `timePath`.

### 6.3 Variables Must Be JSON-Compatible

**Developer responsibility:**

```typescript
// ✅ GOOD - JSON-compatible
setVariable("userName", "Alice", "chain");
setVariable("score", 100, "chain");
setVariable("items", ["sword", "shield"], "chain");

// ❌ BAD - Not JSON-compatible
setVariable("callback", () => console.log("hi"), "chain");
setVariable("element", document.body, "chain");
```

### 6.4 No Built-In Serialization Helpers

**Missing features:**
- No `serializeChain()` utility
- No `deserializeChain()` utility
- No `saveState()` / `loadState()` convenience methods
- No validation of serialized data
- No version migration support

**Developer must implement these manually.**

### 6.5 Active Promises Cannot Be Serialized

**If an event's `run` function returns a Promise** and the chain is serialized mid-execution:
- The Promise itself cannot be serialized
- The event will be in a specific `nowRunMode` state
- On restore, the Promise won't resume - the event may need to restart

**Mitigation:** Events should be idempotent or handle restarts gracefully.

---

## 7. Concrete Example

### 7.1 Event Chain Definition

```typescript
// Define event types (NOT serialized - stays in code)
const gameEvents = makeEventTypes((event) => ({
  showDialog: event({
    run: (params) => {
      console.log(`Character says: ${params.text}`);
    },
    params: { text: "" as string }
  }),

  wait: event({
    run: async (params, { duration }) => {
      await new Promise(resolve => setTimeout(resolve, duration));
    },
    params: { duration: 1000 as number }
  })
}));

initEventTypeGroups({ game: gameEvents });
```

### 7.2 Run Event Chain

```typescript
// Run a quest sequence
runEvents([
  E("game", "showDialog", { text: "Welcome, traveler!" }),
  E("game", "wait", { duration: 2000 }),
  E("game", "showDialog", { text: "What brings you here?" })
], { chainId: "questIntro" });
```

### 7.3 Serialized State (Example)

After the first event runs, state might look like:

```json
{
  "chains": {
    "questIntro": {
      "id": "questIntro",
      "liveEventIds": ["evt_001", "evt_002", "evt_003"],
      "parentChainId": "",
      "canAutoActivate": true,
      "duplicateEventsToAdd": {},
      "variablesByName": {}
    }
  },
  "liveEvents": {
    "evt_001": {
      "id": "evt_001",
      "chainId": "questIntro",
      "event": {
        "group": "game",
        "name": "showDialog",
        "params": { "text": "Welcome, traveler!" }
      },
      "evaluatedParams": { "text": "Welcome, traveler!" },
      "nowRunMode": "end",
      "duration": 0,
      "addTime": 1672531200000,
      "startTime": 1672531200100,
      "goalEndTime": 1672531200100
    },
    "evt_002": {
      "id": "evt_002",
      "chainId": "questIntro",
      "event": {
        "group": "game",
        "name": "wait",
        "params": { "duration": 2000 }
      },
      "evaluatedParams": { "duration": 2000 },
      "nowRunMode": "start",
      "duration": 2000,
      "addTime": 1672531200150,
      "startTime": 1672531200200,
      "goalEndTime": 1672531202200
    },
    "evt_003": {
      "id": "evt_003",
      "chainId": "questIntro",
      "event": {
        "group": "game",
        "name": "showDialog",
        "params": { "text": "What brings you here?" }
      },
      "evaluatedParams": {},
      "nowRunMode": "add",
      "duration": 0,
      "addTime": 1672531200150,
      "startTime": 0,
      "goalEndTime": 0
    }
  }
}
```

### 7.4 Restoration

```typescript
// 1. Re-register event types (must happen first!)
initEventTypeGroups({ game: gameEvents });
initValueTypeGroups({ /* value types */ });

// 2. Restore state
const savedData = JSON.parse(localStorage.getItem("gameState"));

Object.entries(savedData.chains).forEach(([id, state]) => {
  setState("chains", state, id);
});

Object.entries(savedData.liveEvents).forEach(([id, state]) => {
  setState("liveEvents", state, id);
});

// 3. Effects auto-continue the chain!
```

---

## 8. Use Cases Enabled by Serialization

### 8.1 Save/Load Game State

```typescript
// Save game
const saveGame = () => {
  const chains = /* get all chain state */;
  const events = /* get all liveEvent state */;
  localStorage.setItem("gameSave", JSON.stringify({ chains, events }));
};

// Load game
const loadGame = () => {
  const data = JSON.parse(localStorage.getItem("gameSave"));
  // Restore state...
};
```

### 8.2 Offline API Queue

```typescript
// Queue API calls as events
runEvents([
  E("api", "createUser", { name: "Alice" }),
  E("api", "uploadPhoto", { url: "..." }),
  E("api", "sendMessage", { text: "Hello!" })
], { chainId: "offlineQueue" });

// Serialize queue
// Send to server when online
// Server can execute the chain
```

### 8.3 LLM-Generated Event Chains

```typescript
// LLM generates JSON:
const llmOutput = {
  events: [
    { group: "game", name: "showDialog", params: { text: "..." } },
    { group: "game", name: "wait", params: { duration: 1000 } },
    { group: "game", name: "giveItem", params: { item: "sword" } }
  ]
};

// Execute generated chain
runEvents(llmOutput.events);
```

### 8.4 Cross-Platform State Sync

```typescript
// Mobile device serializes game state
const state = serializeEventState();

// Send to cloud
await uploadToCloud(state);

// Desktop loads state
const cloudState = await downloadFromCloud();
deserializeEventState(cloudState);

// Game continues exactly where it left off
```

---

## 9. Source Files Reference

| File | Serializable? | Notes |
|------|---------------|-------|
| [src/stores/chains.ts](src/stores/chains.ts) | ✅ YES | Plain data structure |
| [src/stores/liveEvents.ts](src/stores/liveEvents.ts) | ✅ YES | Plain data structure |
| [src/types.ts](src/types.ts) | ✅ YES (for data types) | EventBlock, ValueBlock are plain objects |
| [src/meta.ts](src/meta.ts) | ❌ NO | Contains function references |
| [src/helpers.ts](src/helpers.ts) | ❌ NO | Contains helper functions |
| [src/internal.ts](src/internal.ts) | ❌ NO | Contains implementation logic |
| [src/effects/](src/effects/) | ❌ NO | Contains effect logic |

---

## 10. Recommendations

### 10.1 For Library Developers

Consider adding built-in serialization utilities:

```typescript
// Proposed API
export function serializeEventState(): string {
  const chains = /* collect all chains */;
  const liveEvents = /* collect all liveEvents */;
  return JSON.stringify({ chains, liveEvents, version: "0.3.2" });
}

export function deserializeEventState(serialized: string): void {
  const { chains, liveEvents, version } = JSON.parse(serialized);
  // Validate version
  // Restore state
}
```

### 10.2 For Library Users

**Best practices:**

1. **Always re-register event types before deserializing state**
2. **Only store JSON-compatible types in variables**
3. **Handle timing gaps gracefully** (events may have "expired")
4. **Validate serialized data** before restoring
5. **Version your serialized format** for future migrations
6. **Test serialization/deserialization thoroughly**

---

## Conclusion

**Repond-events is fundamentally serialization-friendly.** The architecture cleanly separates:
- **Event definitions** (code, with functions) - stays compiled
- **Event instances** (data only) - fully serializable

This enables powerful use cases:
- Save/load game state
- Offline event queues
- LLM-generated event chains
- Cross-device state sync
- Server-driven event execution

The main limitation is that event/value **type definitions** cannot be serialized (since they contain functions). However, event/value **instances** are fully serializable, which is sufficient for most use cases.

**No built-in serialization utilities exist** - developers must manually serialize/deserialize using standard JSON methods. Adding convenience utilities would greatly improve developer experience.
