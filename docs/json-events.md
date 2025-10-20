# Runtime JSON Event Definition Research - Repond Events

## Executive Summary

**Finding:** repond-events has **PARTIAL** support for JSON-based event definition:

✅ **FULLY SUPPORTED - Event/Value INSTANCES:**
- EventBlocks are plain objects - fully JSON-serializable
- ValueBlocks are plain objects - fully JSON-serializable
- Event chains can be created from JSON
- Parameters can be JSON
- Entire event instances can be loaded from JSON

❌ **NOT SUPPORTED - Event/Value TYPE DEFINITIONS:**
- Event type definitions contain `run` functions - cannot be JSON
- Value type definitions contain `run` functions - cannot be JSON
- Event handlers must be defined in compiled code
- Type definitions must be registered at app startup

**Key Pattern:**
- Event TYPE definitions (with logic) → Compiled code
- Event INSTANCES (data only) → JSON

---

## 1. Event Instance Definitions from JSON - FULLY SUPPORTED

### Finding: EventBlocks Are Plain Objects

**Evidence:** [src/types.ts:23](src/types.ts#L23)

```typescript
export type EventBlockBase = {
  group: string;
  name: string;
  params?: Record<any, any>
};
```

**AND:** [src/types.ts:43](src/types.ts#L43)

```typescript
export type EventBlock = EventBlockBase & {
  options: EventBlockOptions;
  type?: "event"
};
```

**Analysis:**
- EventBlocks contain ONLY plain data (strings, objects, numbers)
- No function references
- No closures
- No non-serializable types

**This means EventBlocks can be created from JSON!**

### Example: EventBlock as JSON

```json
{
  "group": "game",
  "name": "showDialog",
  "params": {
    "text": "Welcome, traveler!",
    "duration": 2000
  },
  "options": {
    "chainId": "questIntro",
    "isParallel": false
  },
  "type": "event"
}
```

**This JSON can be parsed and used directly:**

```typescript
// Load from JSON
const eventJson = JSON.parse(jsonString);

// Use it directly (it's already an EventBlock!)
runEvents([eventJson]);
```

### Example: Event Chain from JSON

```json
{
  "chainId": "questIntro",
  "events": [
    {
      "group": "game",
      "name": "showDialog",
      "params": { "text": "Welcome!" },
      "options": {}
    },
    {
      "group": "basic",
      "name": "wait",
      "params": { "duration": 2000 },
      "options": {}
    },
    {
      "group": "game",
      "name": "showDialog",
      "params": { "text": "What brings you here?" },
      "options": {}
    }
  ]
}
```

**Usage:**

```typescript
const chainData = JSON.parse(jsonString);
runEvents(chainData.events, { chainId: chainData.chainId });
```

**This works TODAY with no modifications to the library!**

---

## 2. Value Instance Definitions from JSON - FULLY SUPPORTED

### Finding: ValueBlocks Are Plain Objects

**Evidence:** [src/types.ts:176-182](src/types.ts#L176-L182)

```typescript
export type ValueBlock = {
  group: string;
  name: string;
  params?: Record<any, any>;
  options: ValueBlockOptions;
  type: "value";
};
```

**Analysis:**
- Same pattern as EventBlocks
- Completely plain data
- JSON-serializable

### Example: ValueBlock as JSON

```json
{
  "type": "value",
  "group": "basic",
  "name": "getVariable",
  "params": {
    "name": "playerHealth"
  },
  "options": {}
}
```

**Usage:**

```typescript
const valueJson = JSON.parse(jsonString);

// Use in event parameters
runEvent("ui", "showHealth", {
  amount: valueJson  // It's a ValueBlock!
});
```

### Example: Nested Values in JSON

```json
{
  "type": "value",
  "group": "basic",
  "name": "combine",
  "params": {
    "valueA": "Player: ",
    "valueB": {
      "type": "value",
      "group": "basic",
      "name": "getVariable",
      "params": {
        "name": "playerName"
      },
      "options": {}
    }
  },
  "options": {}
}
```

**This represents:** `V("basic", "combine", { valueA: "Player: ", valueB: V("basic", "getVariable", { name: "playerName" }) })`

**Nested values work perfectly from JSON!**

---

## 3. Event Type Definitions from JSON - NOT SUPPORTED

### Finding: Event Types Contain Functions

**Evidence:** [src/types.ts:82-89](src/types.ts#L82-L89)

```typescript
export type EventTypeDefinition<T_Params extends Record<any, any>> = {
  run: (params: T_Params, liveInfo: EventRunLiveInfo) => void;  // ← FUNCTION
  params: T_Params;
  isParallel?: boolean;
  id?: string;
  duration?: number;
  timePath?: StatePath<ItemType>;
};
```

**Analysis:**
- The `run` property is a function
- Functions cannot be serialized to JSON
- Therefore, event TYPE definitions cannot be loaded from JSON

### What Event Types Look Like

**From** [src/events/basic.ts](src/events/basic.ts):

```typescript
export const basicEvents = makeEventTypes(({ event }) => ({
  wait: event({
    run: async ({ duration }, { remainingTime, elapsedTime, goalEndTime, timePath }) => {
      // ... JavaScript code here
    },
    params: { duration: 1000 as number },
    isParallel: false,
    duration: 1000,
  }),

  log: event({
    run: ({ text }, {}) => {
      console.log(text);
    },
    params: { text: "" as string },
  }),
}));
```

**These `run` functions are JavaScript code** - they cannot be represented in JSON.

### Limitation: Event Handlers Must Be Pre-Defined

**Pattern:**

```typescript
// 1. Event types defined in compiled code
const gameEvents = makeEventTypes(({ event }) => ({
  showDialog: event({
    run: ({ text }) => {
      console.log("Dialog:", text);
    },
    params: { text: "" },
  }),
}));

initEventTypeGroups({ game: gameEvents });

// 2. Event instances loaded from JSON
const eventsFromJson = JSON.parse(jsonString);

// 3. Run the instances (uses the pre-defined types)
runEvents(eventsFromJson);
```

**The event TYPE definitions act as a "palette" of available events.**

JSON can reference these events by `group` and `name`, but cannot define new ones.

---

## 4. Existing Infrastructure for JSON

### No Built-In JSON Parsing

**Evidence:** Searched entire codebase for:
- `JSON.parse`
- `JSON.stringify`
- `json`
- `parse`
- `stringify`

**Result:** No JSON-related code found in `src/` directory.

**Implication:** The library doesn't have built-in JSON import/export utilities, but it doesn't need them!

EventBlocks and ValueBlocks are already plain objects that work with standard `JSON.parse()` and `JSON.stringify()`.

### EventBlocks Are Already JSON-Compatible

**Evidence:** The `EventBlock` type uses only JSON-compatible types:

```typescript
export type EventBlock = EventBlockBase & {
  options: EventBlockOptions;
  type?: "event"
};

export type EventBlockBase = {
  group: string;        // ✅ JSON-compatible
  name: string;         // ✅ JSON-compatible
  params?: Record<any, any>;  // ✅ JSON-compatible (if values are primitives/objects)
};

export type EventBlockOptions = {
  chainId?: ChainId;           // ✅ string
  liveId?: string;             // ✅ string
  addedBy?: string;            // ✅ string
  isParallel?: boolean;        // ✅ boolean
  timePath?: StatePath<ItemType>;  // ✅ string | [string, string]
  hasPriority?: boolean;       // ✅ boolean
  duration?: number;           // ✅ number
  isFast?: boolean;            // ✅ boolean
  parentChainId?: ChainId;     // ✅ string
};
```

**All properties are primitives, strings, numbers, booleans, or plain objects.**

### Helper Functions Create Plain Objects

**Evidence:** [src/helpers.ts:358-386](src/helpers.ts#L358-L386) - `makeValue()` function

```typescript
export function makeValue(...) {
  const valueBlock: ValueBlock = {
    group,
    name,
    params: params || {},
    options: options ?? {},
    type: "value"
  };
  return valueBlock;
}
```

**This returns a plain object** - no methods, no prototypes, just data.

**Same pattern for events:** `E()` / `todo()` functions create plain EventBlock objects.

---

## 5. Use Cases Enabled by JSON

### Use Case 1: LLM-Generated Event Chains

**Scenario:** An LLM generates a quest sequence as JSON.

**LLM Output:**
```json
{
  "quest": "tutorial",
  "events": [
    {
      "group": "game",
      "name": "showDialog",
      "params": {
        "character": "guide",
        "text": "Welcome to the game! Let me show you around."
      },
      "options": {}
    },
    {
      "group": "basic",
      "name": "wait",
      "params": { "duration": 3000 },
      "options": {}
    },
    {
      "group": "game",
      "name": "giveItem",
      "params": {
        "item": "sword",
        "quantity": 1
      },
      "options": {}
    },
    {
      "group": "game",
      "name": "showDialog",
      "params": {
        "character": "guide",
        "text": "Here's a sword to defend yourself!"
      },
      "options": {}
    }
  ]
}
```

**Game Code:**
```typescript
// Event types are pre-defined in game code
const gameEvents = makeEventTypes(({ event }) => ({
  showDialog: event({ run: showDialogHandler, params: { character: "", text: "" } }),
  giveItem: event({ run: giveItemHandler, params: { item: "", quantity: 0 } }),
}));

initEventTypeGroups({
  game: gameEvents,
  basic: basicEvents,
});

// Load LLM-generated quest
const llmQuest = await fetch("/api/generate-quest").then(r => r.json());

// Run it!
runEvents(llmQuest.events, { chainId: `quest_${llmQuest.quest}` });
```

**This works TODAY!**

### Use Case 2: Server-Driven Event Execution

**Scenario:** Mobile game downloads event chains from server.

**Server Response:**
```json
{
  "dailyQuest": {
    "id": "daily_2024_01_15",
    "events": [
      { "group": "game", "name": "startQuest", "params": { "questId": "daily_combat" }, "options": {} },
      { "group": "game", "name": "spawnEnemy", "params": { "enemy": "goblin", "count": 5 }, "options": {} },
      { "group": "game", "name": "waitForCombatEnd", "params": {}, "options": {} },
      { "group": "game", "name": "giveReward", "params": { "gold": 100, "xp": 50 }, "options": {} }
    ]
  }
}
```

**Mobile Code:**
```typescript
// Download quest from server
const quests = await fetch("https://game-server.com/quests/daily").then(r => r.json());

// Execute it locally
runEvents(quests.dailyQuest.events, { chainId: quests.dailyQuest.id });
```

**Benefits:**
- Update content without app update
- Personalized quests per player
- A/B testing different quest flows
- No code compilation needed (works on iOS!)

### Use Case 3: Event Chains with Dynamic Values from JSON

**Scenario:** Event parameters use Values for late-binding.

**JSON:**
```json
{
  "group": "game",
  "name": "applyDamage",
  "params": {
    "target": "enemy",
    "amount": {
      "type": "value",
      "group": "basic",
      "name": "getVariable",
      "params": {
        "name": "lastCalculatedDamage"
      },
      "options": {}
    }
  },
  "options": {}
}
```

**This event will:**
1. Load from JSON
2. Parse into EventBlock with nested ValueBlock
3. When event runs, evaluate the Value
4. Get the latest value of "lastCalculatedDamage" variable
5. Apply that damage

**Fully dynamic, fully serializable!**

### Use Case 4: Offline Event Queue Persistence

**Scenario:** Save pending events to IndexedDB/localStorage.

```typescript
// Create offline event queue
runEvents([
  E("api", "createUser", { name: "Alice" }),
  E("api", "uploadAvatar", { url: "..." }),
  E("api", "sendMessage", { text: "Hello!" }),
], { chainId: "offlineQueue" });

// Serialize chain state
const chainState = getState("chains", "offlineQueue");
const liveEventIds = chainState.liveEventIds;
const eventsData = liveEventIds.map(id => {
  const liveEvent = getState("liveEvents", id);
  return liveEvent.event;  // This is an EventBlock (plain object)
});

// Save to localStorage
localStorage.setItem("offlineQueue", JSON.stringify({
  chainId: "offlineQueue",
  events: eventsData
}));

// Later, restore and continue
const saved = JSON.parse(localStorage.getItem("offlineQueue"));
runEvents(saved.events, { chainId: saved.chainId });
```

---

## 6. Limitations

### Limitation 1: Event Handlers Must Be Pre-Defined

**Cannot do:**
```json
{
  "group": "custom",
  "name": "myNewEvent",
  "run": "function() { console.log('hi'); }",  // ❌ Functions can't be JSON
  "params": {}
}
```

**Must do instead:**
```typescript
// In compiled code
const customEvents = makeEventTypes(({ event }) => ({
  myNewEvent: event({
    run: () => { console.log('hi'); },
    params: {}
  }),
}));

initEventTypeGroups({ custom: customEvents });
```

**Then JSON can reference it:**
```json
{
  "group": "custom",
  "name": "myNewEvent",
  "params": {},
  "options": {}
}
```

### Limitation 2: Custom Values Must Be Pre-Defined

**Same pattern as events** - value TYPE definitions must be in code, value INSTANCES can be JSON.

### Limitation 3: Event/Value Types Are a Fixed Palette

**At runtime, you can only use events/values that were registered at startup.**

```typescript
// App startup
initEventTypeGroups({
  game: gameEvents,
  ui: uiEvents,
  basic: basicEvents,
});

initValueTypeGroups({
  basic: basicValues,
  custom: customValues,
});
```

**JSON can only reference these groups and names.**

If JSON tries to use `{ group: "unknown", name: "eventName" }`, the event will fail (the handler won't be found).

**Evidence:** [src/internal.ts:141-143](src/internal.ts#L141-L143)

```typescript
const eventTypeDefinition = repondEventsMeta.allEventTypeGroups[
  liveEventState.event.group
]?.[liveEventState.event.name];

if (!eventTypeDefinition) {
  console.warn(`Event not found: ${liveEventState.event.group}:${liveEventState.event.name}`);
  return;
}
```

### Limitation 4: Non-Serializable Parameters

**If event parameters contain non-JSON types, they can't be serialized:**

❌ **Cannot serialize:**
```typescript
E("ui", "showPopup", {
  onClick: () => console.log("clicked"),  // Function
  element: document.body,                 // DOM node
  date: new Date(),                       // Date object (will become string)
})
```

✅ **Can serialize:**
```typescript
E("ui", "showPopup", {
  text: "Click me",
  duration: 5000,
  position: { x: 100, y: 200 },
})
```

---

## 7. Future Plans - No Evidence

### No TODOs About JSON

**Searched for:**
- "TODO" + "JSON"
- "TODO" + "load"
- "TODO" + "runtime"
- "TODO" + "dynamic"

**Result:** No TODOs found about JSON loading or runtime event definition.

### No Incomplete JSON Infrastructure

**Searched for:**
- JSON parsers
- Event loaders
- Schema definitions
- Validation logic

**Result:** No infrastructure specific to JSON import/export.

**Conclusion:** The library doesn't need dedicated JSON infrastructure because EventBlocks and ValueBlocks are already plain objects.

---

## 8. Recommended Patterns

### Pattern 1: Event Type Registry

**Define a comprehensive event palette at startup:**

```typescript
// events/index.ts
const allEventGroups = {
  game: gameEvents,
  ui: uiEvents,
  combat: combatEvents,
  quest: questEvents,
  api: apiEvents,
  basic: basicEvents,
};

initEventTypeGroups(allEventGroups);
```

**Then JSON can reference any event:**
```json
{ "group": "combat", "name": "attack", "params": { ... } }
```

### Pattern 2: JSON Schema Validation

**Validate JSON before running:**

```typescript
import Ajv from "ajv";

const eventChainSchema = {
  type: "object",
  properties: {
    chainId: { type: "string" },
    events: {
      type: "array",
      items: {
        type: "object",
        required: ["group", "name"],
        properties: {
          group: { type: "string" },
          name: { type: "string" },
          params: { type: "object" },
          options: { type: "object" },
        },
      },
    },
  },
  required: ["chainId", "events"],
};

const ajv = new Ajv();
const validate = ajv.compile(eventChainSchema);

// Validate before running
function runEventsFromJson(json: string) {
  const data = JSON.parse(json);
  if (!validate(data)) {
    throw new Error("Invalid event chain JSON");
  }
  runEvents(data.events, { chainId: data.chainId });
}
```

### Pattern 3: TypeScript Types for JSON

**Define types for JSON event chains:**

```typescript
type JsonEventChain = {
  chainId: string;
  events: Array<{
    group: string;
    name: string;
    params?: Record<string, any>;
    options?: {
      isParallel?: boolean;
      duration?: number;
      timePath?: string | [string, string];
    };
  }>;
};

// Use it
const questData: JsonEventChain = JSON.parse(jsonString);
runEvents(questData.events, { chainId: questData.chainId });
```

### Pattern 4: Helper for JSON Import

**Create a utility:**

```typescript
export function loadEventChainFromJson(json: string): void {
  const data = JSON.parse(json) as JsonEventChain;

  // Validate event types exist
  for (const event of data.events) {
    if (!repondEventsMeta.allEventTypeGroups[event.group]?.[event.name]) {
      throw new Error(`Event type not found: ${event.group}:${event.name}`);
    }
  }

  // Run the chain
  runEvents(data.events, { chainId: data.chainId });
}
```

---

## 9. Comparison to Other Systems

### Unity (Game Engine)

**Asset Bundles:**
- Can load assets (data) at runtime
- Cannot load code/scripts at runtime (on iOS)
- Similar constraint to repond-events

**repond-events parallel:**
- Event instances = Unity asset bundles (data)
- Event types = Unity scripts (code)

### Unreal Engine

**Blueprints:**
- Visual scripting that compiles to native code
- Cannot load new blueprint logic at runtime on iOS

**repond-events is similar** - event definitions are code, instances are data.

### Redux

**Action Creators:**
- Action types are pre-defined
- Action instances (payloads) can be dynamic

**Same pattern!**
```typescript
// Pre-defined (like event types)
const INCREMENT = "INCREMENT";

// Dynamic instances (like EventBlocks)
{ type: INCREMENT, payload: { amount: 5 } }
```

---

## 10. Summary

### What IS Supported

| Feature | Status | Evidence |
|---------|--------|----------|
| **EventBlocks from JSON** | ✅ Fully Supported | Plain objects ([src/types.ts:43](src/types.ts#L43)) |
| **ValueBlocks from JSON** | ✅ Fully Supported | Plain objects ([src/types.ts:176-182](src/types.ts#L176-L182)) |
| **Nested Values in JSON** | ✅ Fully Supported | Recursive evaluation ([src/valueHelpers.ts](src/valueHelpers.ts)) |
| **Event Chains from JSON** | ✅ Fully Supported | Arrays of EventBlocks |
| **JSON Serialization** | ✅ Fully Supported | `JSON.stringify(eventBlock)` works |
| **JSON Deserialization** | ✅ Fully Supported | `JSON.parse(json)` creates valid EventBlocks |

### What is NOT Supported

| Feature | Status | Evidence |
|---------|--------|----------|
| **Event Type Definitions from JSON** | ❌ Not Supported | Contains `run` functions ([src/types.ts:82-89](src/types.ts#L82-L89)) |
| **Value Type Definitions from JSON** | ❌ Not Supported | Contains `run` functions ([src/types.ts:200-205](src/types.ts#L200-L205)) |
| **Dynamic Event Handler Loading** | ❌ Not Supported | Functions can't be serialized |
| **Built-in JSON Import/Export** | ⚠️ Not Needed | EventBlocks are already compatible |

### Key Insight

**repond-events follows a "Data-Driven Event" pattern:**

```
┌─────────────────────────┐
│  Event TYPE Definitions │  ← CODE (compiled, pre-defined)
│  (run functions)        │  ← Cannot be JSON
└─────────────────────────┘

┌─────────────────────────┐
│  Event INSTANCES        │  ← DATA (dynamic, runtime)
│  (EventBlocks)          │  ← Fully JSON-serializable
└─────────────────────────┘
```

**This enables:**
- LLM-generated event chains
- Server-driven content updates
- Offline event persistence
- Cross-platform state sync
- iOS-compatible dynamic content (no code compilation needed)

**While maintaining:**
- Type safety (TypeScript types for event handlers)
- Code reusability (event types defined once)
- Performance (compiled handlers, not eval/interpreted)

### Recommendations

**For Library Users:**
1. Define a comprehensive event palette at startup
2. Use JSON for event INSTANCES, not TYPE definitions
3. Validate JSON schemas before execution
4. Use TypeScript types for JSON event chains
5. Test that all referenced event types exist

**For Library Developers:**
1. Consider adding built-in JSON validation utilities
2. Provide TypeScript types for JSON event schemas
3. Add helper functions for JSON import/export
4. Document the data-driven event pattern
5. Provide examples of LLM/server-driven event chains

### Conclusion

**repond-events has excellent support for JSON-based event instances**, making it ideal for:
- AI-generated content
- Server-driven experiences
- Cross-device state sync
- Dynamic event chains

The limitation that event TYPE definitions must be code (not JSON) is actually a strength:
- Ensures type safety
- Maintains performance
- Follows platform constraints (iOS)
- Separates concerns (logic vs. data)

This is the **correct architectural choice** for a serializable event system.
