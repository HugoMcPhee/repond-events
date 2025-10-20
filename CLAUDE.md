# Repond Events - Technical Reference for LLMs

This document provides a technical overview of repond-events for AI assistants and developers.

---

## Library Overview

**Repond Events** is a serializable event orchestration library built on [Repond](https://github.com/HugoMcPhee/repond) state management.

**Core Philosophy:**
- Events are **data** (serializable instances) not **code** (functions)
- Values enable **late-binding** (evaluation at runtime, not definition time)
- Everything is **serializable** (save/load, LLM-generation, server-driven)
- Time is **controllable** (pause, slow-motion, fast-forward)

---

## Key Concepts

### 1. Event Type Definitions vs. Event Instances

**Event TYPE Definitions** (code):
```typescript
const gameEvents = makeEventTypes(({ event }) => ({
  showDialog: event({
    run: ({ text }) => console.log(text),  // ← Function (code)
    params: { text: "" as string },
  }),
}));
```
- Contain `run` functions (logic)
- Defined in compiled code
- Cannot be serialized
- Registered once at startup

**Event INSTANCES** (data):
```typescript
E("game", "showDialog", { text: "Hello" })
// Creates: { group: "game", name: "showDialog", params: { text: "Hello" }, options: {} }
```
- Plain objects (no functions)
- Fully JSON-serializable
- Can be generated dynamically (LLM, server, runtime)
- Reference event types by `group:name`

**Same pattern for Values:**
- Value TYPE definitions (code with `run` functions)
- Value INSTANCES (plain objects, JSON-compatible)

---

### 2. Events

**Events are actions that execute over time.**

**Structure:**
```typescript
type EventBlock = {
  group: string;        // Namespace (e.g., "game", "ui")
  name: string;         // Event name (e.g., "showDialog")
  params?: Record<any, any>;  // Parameters (can contain ValueBlocks)
  options?: {
    chainId?: string;   // Which chain to add to
    isParallel?: boolean;  // Can run alongside others
    duration?: number;  // Override default duration
    // ... more options
  };
};
```

**Lifecycle (RunModes):**
- `add` - Added to chain
- `start` - Begins execution
- `pause` / `unpause` - Temporary pause
- `suspend` / `unsuspend` - Deep suspend with state save
- `skip` - Skip this event
- `cancel` - Cancel this event
- `end` - Completed

**Key Properties:**
- **Sequential by default** - Events run in order
- **Can be parallel** - Set `isParallel: true`
- **Have duration** - Timing tracked via Repond state
- **Have parameters** - Can include Values for late-binding

---

### 3. Chains

**Chains are ordered sequences of events.**

**Structure:**
```typescript
type ChainState = {
  id: string;                     // Chain ID
  liveEventIds: string[];         // Queue of active events
  parentChainId: string;          // Parent chain (for sub-chains)
  canAutoActivate: boolean;       // Auto-start next event
  variablesByName: Record<string, any>;  // Scoped variables
};
```

**Key Properties:**
- **Linear array** - Events stored in order
- **Auto-progression** - Next event starts when current ends
- **Scoped variables** - Variables isolated within chain
- **Hierarchical** - Chains can have sub-chains (parent-child)

---

### 4. Values

**Values are deferred computations evaluated at runtime.**

**Why Values Matter:**
- Parameters are evaluated **when events run**, not when defined
- Enables **dynamic composition** - build complex values from simple ones
- Enables **conditional logic** - choose values/chains based on conditions
- **Fully serializable** - can be JSON

**Structure:**
```typescript
type ValueBlock = {
  type: "value";
  group: string;      // Value group (e.g., "basic", "custom")
  name: string;       // Value name (e.g., "getVariable", "ifThen")
  params?: Record<any, any>;  // Parameters (can be nested ValueBlocks!)
  options?: { /* ... */ };
};
```

**Built-in Values:**
- `combine` - Concatenate/add values
- `string` - Identity function
- `getVariable` - Retrieve scoped variable
- `getMyChainId` - Get current chain ID
- `getEventValue` - Run sub-events, capture return value

**Custom Values:**
Developers can create any value type, including:
- Conditional logic (`ifThen`, `chooseChain`)
- Math operations (`add`, `multiply`)
- State access (`getStateValue`)
- Boolean logic (`and`, `or`, `not`)
- Comparisons (`greaterThan`, `equals`)

---

### 5. Timing System

**Events use Repond state for timing, not `Date.now()`.**

**Time Path:**
```typescript
initEventTypeGroups(events, {
  defaultTimePath: ["global", "time", "elapsed"]
});
```

**Custom Time:**
```typescript
// Update elapsed time based on time speed
const speed = 0.5;  // Slow motion
const delta = Date.now() - lastUpdate;
const scaledDelta = delta * speed;
setState("global.time.elapsed", elapsed + scaledDelta);
```

**Benefits:**
- **Pause** - Stop updating elapsed time
- **Slow-motion** - Update at fraction of real time
- **Fast-forward** - Update faster than real time
- **Multiple streams** - Different chains use different time paths

---

## Architecture

### Data Flow

```
1. runEvent("game", "showDialog", { text: "Hello" })
   ↓
2. Creates EventBlock (plain object)
   ↓
3. Adds to Repond store (chains + liveEvents)
   ↓
4. Repond effects detect state change
   ↓
5. chainEffects activate event
   ↓
6. liveEventEffects handle lifecycle
   ↓
7. Parameters evaluated (Values resolved)
   ↓
8. Event handler (run function) executes
   ↓
9. Event completes, next event starts
   ↓
10. Chain removes when empty
```

### Stores (Repond State)

**chains store:**
```typescript
{
  [chainId]: {
    id: string;
    liveEventIds: string[];  // Active events
    parentChainId: string;
    canAutoActivate: boolean;
    variablesByName: Record<string, any>;
  }
}
```

**liveEvents store:**
```typescript
{
  [liveEventId]: {
    id: string;
    chainId: string;
    event: EventBlockBase;        // The event data
    evaluatedParams: ParamMap;    // Computed parameters
    nowRunMode: RunMode;          // Current state
    duration: number;
    addTime, startTime, goalEndTime: number;  // Timing
    // ... more lifecycle tracking
  }
}
```

### Effects (Repond Automation)

**chainEffects:**
- Watch `chains` store
- Auto-activate events based on `liveEventIds`
- Handle chain lifecycle (creation, removal)

**liveEventEffects:**
- Watch `liveEvents` store
- Handle event lifecycle (start, pause, end)
- Trigger event handlers
- Update timing state

**Run on:** `"eventUpdates"` step (separate from React rendering)

### Metadata (Runtime)

**repondEventsMeta:**
```typescript
{
  allEventTypeGroups: Record<string, Record<string, EventTypeDefinition>>,
  allValueTypeGroups: Record<string, Record<string, ValueTypeDefinition>>,
  resolveValueMap: Record<string, (value: any) => void>,  // For getEventValue
  // ... other runtime state
}
```

- **Not serializable** (contains functions)
- Re-initialized on app startup
- Stores event/value type definitions

---

## Serialization

### What Can Be Serialized

✅ **Fully Serializable:**
- EventBlocks - `E("game", "action", { param: value })`
- ValueBlocks - `V("basic", "getVariable", { name: "x" })`
- Chain state - `getState("chains", chainId)`
- LiveEvent state - `getState("liveEvents", eventId)`
- Variables - (if JSON-compatible values)

❌ **Not Serializable:**
- Event TYPE definitions (contain `run` functions)
- Value TYPE definitions (contain `run` functions)
- Metadata (contains functions, runtime state)

### Pattern

```
┌─────────────────────────────┐
│  Type Definitions (code)    │  ← Pre-defined at startup
│  makeEventTypes()           │  ← Cannot be JSON
│  makeValueTypes()           │
└─────────────────────────────┘
          ↓ references
┌─────────────────────────────┐
│  Instances (data)           │  ← Created at runtime
│  EventBlocks, ValueBlocks   │  ← Fully JSON-serializable
└─────────────────────────────┘
```

### Save/Load Pattern

```typescript
// Save
const chainState = getState("chains", chainId);
const liveEventStates = chainState.liveEventIds.map(id =>
  getState("liveEvents", id)
);
const saved = JSON.stringify({ chainState, liveEventStates });

// Load
const { chainState, liveEventStates } = JSON.parse(saved);
// Restore to Repond stores
// Effects auto-continue execution
```

---

## Conditional Logic

### Via Custom Values

**Create conditional value:**
```typescript
const conditionalValues = makeValueTypes(({ value }) => ({
  ifThen: value({
    run: ({ condition, thenValue, elseValue }) => {
      return condition ? thenValue : elseValue;
    },
    params: {
      condition: false as boolean,
      thenValue: undefined as any,
      elseValue: undefined as any,
    },
  }),

  chooseChain: value({
    run: ({ condition, thenChain, elseChain }) => {
      return condition ? thenChain : elseChain;
    },
    params: {
      condition: false as boolean,
      thenChain: [] as EventBlock[],
      elseChain: [] as EventBlock[],
    },
  }),
}));
```

**Use for conditional parameters:**
```typescript
E("game", "action", {
  param: V("conditional", "ifThen", {
    condition: someBoolean,
    thenValue: "optionA",
    elseValue: "optionB"
  })
});
```

**Use for conditional chains:**
```typescript
E("game", "process", {
  result: V("basic", "getEventValue", {
    events: V("conditional", "chooseChain", {
      condition: someBoolean,
      thenChain: [E("game", "pathA", {})],
      elseChain: [E("game", "pathB", {})]
    })
  })
});
```

**This is serializable!** Conditional values can be in JSON.

---

## Common Patterns

### 1. Simple Sequential Events

```typescript
runEvents([
  E("game", "fadeIn", { duration: 500 }),
  E("game", "showDialog", { text: "Welcome!" }),
  E("game", "wait", { duration: 2000 }),
  E("game", "fadeOut", { duration: 500 }),
]);
```

### 2. Late-Binding Parameters

```typescript
E("ui", "showScore", {
  score: V("basic", "getVariable", { name: "currentScore" })
});
// Value is fetched when event runs, not when defined
```

### 3. Event Chaining (Result Passing)

```typescript
E("game", "applyDamage", {
  amount: V("basic", "getEventValue", {
    events: [
      E("game", "calculateDamage", { baseDamage: 50 }),
      E("basic", "returnValue", {
        value: V("basic", "getVariable", { name: "calculatedDamage" })
      })
    ]
  })
});
```

### 4. Conditional Branching

```typescript
E("game", "process", {
  result: V("basic", "getEventValue", {
    events: V("conditional", "chooseChain", {
      condition: V("game", "checkHealth"),
      thenChain: [ /* events if healthy */ ],
      elseChain: [ /* events if unhealthy */ ]
    })
  })
});
```

### 5. Pause/Resume

```typescript
import { chainDo } from "repond-events";

runEvents([...], { chainId: "mainQuest" });

// Later
chainDo("pause", "mainQuest");
chainDo("unpause", "mainQuest");
```

### 6. Custom Time Speed

```typescript
// Slow motion
setState("global.time.speed", 0.5);

// Pause
setState("global.time.speed", 0);

// Fast forward
setState("global.time.speed", 2.0);
```

### 7. LLM-Generated Events

```json
{
  "events": [
    { "group": "game", "name": "showDialog", "params": { "text": "Hi!" }, "options": {} },
    { "group": "basic", "name": "wait", "params": { "duration": 1000 }, "options": {} }
  ]
}
```

```typescript
const llmEvents = JSON.parse(llmGeneratedJson);
runEvents(llmEvents.events);
```

---

## API Quick Reference

### Core Functions

```typescript
// Define events
makeEventTypes(({ event }) => ({
  eventName: event({ run, params, duration?, isParallel? })
}))

// Define values
makeValueTypes(({ value }) => ({
  valueName: value({ run, params })
}))

// Register
initEventTypeGroups({ groupName: eventTypes }, { defaultTimePath? })
initValueTypeGroups({ groupName: valueTypes })

// Run events
runEvent(group, name, params?, options?)
runEvents(eventBlocks, options?)

// Create blocks
E(group, name, params?, options?)  // EventBlock
V(group, name, params?, options?)  // ValueBlock

// Control
eventDo(runMode, liveId, options?)
chainDo(runMode, chainId, options?)
skipToEvent(liveId)
cancelUpToEvent(liveId)

// Variables
setVariable(name, value, scope)
getVariable(name, scope)
```

### Built-in Events

- `wait` - Delay for duration
- `log` - Log to console
- `setState` - Update Repond state
- `setVariable` - Set scoped variable
- `returnValue` - Return from sub-chain

### Built-in Values

- `combine` - Concatenate/add
- `string` - Identity
- `getVariable` - Retrieve variable
- `getMyChainId` - Current chain ID
- `getEventValue` - Run events, capture result

---

## Integration with Repond

**Repond Events builds on Repond:**
- Uses Repond stores (`chains`, `liveEvents`)
- Uses Repond effects (auto-run on state changes)
- Uses Repond state paths for timing
- Uses Repond APIs (`setState`, `getState`, `addItem`, `removeItem`)

**Events run on separate step:**
- `"eventUpdates"` step (not React rendering)
- Can be paused/resumed independently

**State paths:**
```typescript
setState("chains.liveEventIds", [...], chainId)
setState("liveEvents.nowRunMode", "start", eventId)
setState("global.time.elapsed", time)
```

---

## Use Cases

### Games
- Cutscenes, dialogue systems
- Quest sequences
- Combat choreography
- Pause menus that actually pause
- Slow-motion mechanics
- Save/load systems

### UI Workflows
- Multi-step wizards
- Onboarding flows
- Animated transitions
- Form validation sequences

### Offline-First Apps
- Queue API calls as events
- Serialize and sync across devices
- Resume when back online

### LLM/AI Content
- ChatGPT generates quests/dialogues
- Server-driven event sequences
- Personalized experiences
- No code compilation needed

---

## Future Vision

**Current:**
- ✅ Serializable event orchestration
- ✅ Late-binding values
- ✅ Custom time control

**Future:**
- 🔮 Serializable effects (Repond subscriptions as data)
- 🔮 Complete runtime editability
- 🔮 Built-in conditional value library
- 🔮 Visual event editor

**Goal:** Make entire app/game logic serializable and tweakable at runtime.

---

## Important Notes for LLMs

### When Helping Users

1. **Event definitions vs. instances** - Clarify the difference
2. **Values are key** - Emphasize late-binding benefits
3. **Conditionals via values** - Show how custom values enable branching
4. **Serialization** - Explain what can/cannot be JSON
5. **Custom time** - Highlight this unique feature

### Common Mistakes

❌ **Don't:**
- Suggest setTimeout for delays (use `wait` event)
- Use static values when late-binding needed (use Values)
- Assume conditionals are built-in (show custom value pattern)
- Forget that event types must be pre-defined (instances are dynamic)

✅ **Do:**
- Use Values for dynamic parameters
- Show custom value examples for conditionals
- Explain serialization benefits
- Demonstrate pause/resume capabilities
- Show LLM use cases (very powerful!)

### Code Generation Tips

- Always import from "repond-events"
- Use `E()` for EventBlocks, `V()` for ValueBlocks
- Show both event definition AND usage
- Include chain IDs for long-running chains
- Demonstrate Values when appropriate
- Show conditional logic via custom values

---

## Resources

- [README.md](README.md) - Main documentation
- [Getting Started Examples](docs/getting-started.md) - 10 practical examples
- [Values Guide](docs/values-guide.md) - Deep dive into Values
- [Serialization Guide](docs/serialization-guide.md) - Serialization guide
- [Conditional Logic](docs/conditional-logic.md) - Conditional logic patterns
- [JSON Events](docs/json-events.md) - JSON event definition
- [Architecture Overview](docs/architecture.md) - Complete overview

---

## Credits

Created by [Hugo McPhee](https://github.com/HugoMcPhee)

Built on [Repond](https://github.com/HugoMcPhee/repond)
