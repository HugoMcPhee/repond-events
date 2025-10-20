# Repond Events

**Serializable event orchestration with fine-grained control**

Unlike `setTimeout` or typical event systems, repond-events lets you:

- ✅ **Save and restore** entire event chains (perfect for game save systems)
- ✅ **Pause, resume, and control time** (slow-motion, fast-forward, independent time streams)
- ✅ **Generate events dynamically** from AI/LLMs or load from servers
- ✅ **Chain events** with late-binding values for complex, composable sequences
- ✅ **Conditional logic** through custom values (yes, if/then/else is possible!)

Built on [Repond](https://github.com/HugoMcPhee/repond) for reactive state management.

---

## Why Repond Events?

**The Problem:**

Traditional event systems use `setTimeout` and callbacks, which are:
- ❌ Not serializable (can't save mid-execution)
- ❌ Can't be paused or resumed
- ❌ Tied to wall-clock time (no slow-motion/fast-forward)
- ❌ Hard to chain with dynamic parameters

**The Solution:**

Repond Events provides **serializable event orchestration**:
- ✅ Event chains are plain data (JSON-compatible)
- ✅ Full lifecycle control (pause, resume, skip, cancel)
- ✅ Custom time sources (your time, not `Date.now()`)
- ✅ Late-binding values for dynamic composition
- ✅ Works anywhere - games, UI workflows, offline-first apps, LLM-generated content

---

## Quick Start

### Installation

```bash
npm install repond-events repond
```

### Basic Example

```typescript
import { makeEventTypes, initEventTypeGroups, runEvents, E } from "repond-events";

// 1. Define event types
const basicEvents = makeEventTypes(({ event }) => ({
  log: event({
    run: ({ message }) => console.log(message),
    params: { message: "" as string },
  }),

  wait: event({
    run: async ({}) => { /* timing handled by system */ },
    params: { duration: 1000 as number },
    duration: 1000,
  }),
}));

// 2. Register events
initEventTypeGroups({ basic: basicEvents });

// 3. Run a sequence
runEvents([
  E("basic", "log", { message: "Starting..." }),
  E("basic", "wait", { duration: 1000 }),
  E("basic", "log", { message: "After 1 second" }),
  E("basic", "wait", { duration: 2000 }),
  E("basic", "log", { message: "Done!" }),
]);
```

**Output:**
```
Starting...
[1 second pause]
After 1 second
[2 seconds pause]
Done!
```

---

## Core Concepts

### 1. Events Execute Sequentially

Events run in order by default:

```typescript
runEvents([
  E("game", "fadeIn", { duration: 500 }),
  E("game", "showDialog", { text: "Welcome!" }),
  E("game", "fadeOut", { duration: 500 }),
]);
```

Each event completes before the next starts.

### 2. Values Enable Late-Binding

Values are evaluated **when events run**, not when defined:

```typescript
import { V } from "repond-events";

// Without values - fixed at definition time
runEvent("ui", "showScore", { score: 100 });

// With values - evaluated at runtime
runEvent("ui", "showScore", {
  score: V("basic", "getVariable", { name: "currentScore" })
});
```

**Why this matters:** The value is fetched when the event runs, so it's always current.

### 3. Custom Values Unlock Conditional Logic

Create your own value types for reusable logic:

```typescript
import { makeValueTypes, initValueTypeGroups } from "repond-events";

const customValues = makeValueTypes(({ value }) => ({
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
}));

initValueTypeGroups({ custom: customValues });

// Use it for conditional logic
runEvent("game", "applyEffect", {
  effectType: V("custom", "ifThen", {
    condition: V("game", "isPlayerHealthy"),
    thenValue: "healing",
    elseValue: "damage"
  })
});
```

**You can even choose between event chains:**

```typescript
const conditionalValues = makeValueTypes(({ value }) => ({
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

runEvent("game", "processAction", {
  result: V("basic", "getEventValue", {
    events: V("conditional", "chooseChain", {
      condition: V("game", "isHealthy"),
      thenChain: [
        E("game", "heal", { amount: 50 }),
        E("basic", "returnValue", { value: "success" })
      ],
      elseChain: [
        E("game", "damage", { amount: 10 }),
        E("basic", "returnValue", { value: "failure" })
      ]
    })
  })
});
```

### 4. Everything is Serializable

Event chains are plain objects - fully JSON-compatible:

```json
{
  "events": [
    {
      "group": "game",
      "name": "showDialog",
      "params": { "text": "Hello!" },
      "options": {}
    },
    {
      "group": "basic",
      "name": "wait",
      "params": { "duration": 2000 },
      "options": {}
    }
  ]
}
```

**This enables:**
- Save/load game state (save mid-cutscene!)
- LLM-generated events (ChatGPT creates quests)
- Server-driven content (update without app updates)
- Works on iOS (no runtime code compilation)

---

## Key Features

### Pause/Resume Events

```typescript
import { chainDo } from "repond-events";

runEvents([
  E("game", "cutscene1", {}),
  E("basic", "wait", { duration: 5000 }),
  E("game", "cutscene2", {}),
], { chainId: "mainStory" });

// Pause the entire chain
chainDo("pause", "mainStory");

// Resume later
chainDo("unpause", "mainStory");
```

**Perfect for:** Pause menus, game saves, interactive tutorials

### Custom Time Speed

Events use Repond state for timing, not `Date.now()`:

```typescript
import { setState } from "repond";

// Initialize with custom time path
initEventTypeGroups(allEvents, {
  defaultTimePath: ["global", "time", "elapsed"]
});

// Control time speed
setState("global.time.speed", 0.5);  // Slow motion (0.5x)
setState("global.time.speed", 2.0);  // Fast forward (2x)
setState("global.time.speed", 0);    // Pause
```

**Perfect for:** Slow-motion mechanics, pause menus, multiple time streams (game time vs. UI time)

### LLM-Generated Events

```typescript
// LLM generates quest JSON
const llmQuest = await fetch("/api/llm/generate-quest").then(r => r.json());

// Run it directly
runEvents(llmQuest.events, { chainId: `quest_${llmQuest.id}` });
```

**Perfect for:** Dynamic quests, procedural content, personalized experiences

### Save/Load Event Chains

```typescript
import { getState, setState } from "repond";

// Save
const chainState = getState("chains", "myChain");
const liveEvents = chainState.liveEventIds.map(id => getState("liveEvents", id));
localStorage.setItem("gameSave", JSON.stringify({ chainState, liveEvents }));

// Load
const saved = JSON.parse(localStorage.getItem("gameSave"));
// Restore state and continue exactly where you left off
```

**Perfect for:** Game save systems, offline-first apps, cross-device sync

---

## Use Cases

### Games

- Cutscenes and dialogue systems
- Quest sequences
- Combat choreography
- Tutorial flows
- Pause menus (that actually pause events!)
- Slow-motion mechanics

### UI Workflows

- Multi-step wizards
- Onboarding flows
- Animated transitions with timing control
- Form validation sequences

### Offline-First Apps

- Queue API calls as events
- Serialize and sync across devices
- Resume operations when back online

### LLM/AI-Generated Content

- ChatGPT generates quest chains
- Server-driven event sequences
- Dynamic dialogue trees
- Personalized user experiences

---

## Comparison

| Feature | setTimeout | XState | GSAP | Repond Events |
|---------|-----------|--------|------|---------------|
| **Serializable** | ❌ | ⚠️ Partial | ❌ | ✅ |
| **Pause/Resume** | ❌ | ⚠️ Limited | ✅ | ✅ |
| **Custom Time** | ❌ | ❌ | ⚠️ Limited | ✅ |
| **Conditional Logic** | ✅ Code | ✅ Built-in | ❌ | ✅ Values |
| **Event Chaining** | ⚠️ Manual | ⚠️ Manual | ✅ | ✅ |
| **LLM-Ready** | ❌ | ❌ | ❌ | ✅ |
| **Save/Load** | ❌ | ⚠️ Partial | ❌ | ✅ |

---

## Documentation

- **[Getting Started Examples](docs/getting-started.md)** - 10 practical examples from basics to advanced
- **[Values Guide](docs/values-guide.md)** - Deep dive into the Values system
- **[Serialization Guide](docs/serialization-guide.md)** - How to save/load event chains
- **[Conditional Logic](docs/conditional-logic.md)** - Implementing if/then/else with custom values
- **[JSON Events](docs/json-events.md)** - Loading events from JSON (LLM use cases)
- **[Architecture Overview](docs/architecture.md)** - Complete overview of the library

---

## API Overview

### Defining Events

```typescript
import { makeEventTypes, initEventTypeGroups } from "repond-events";

const myEvents = makeEventTypes(({ event }) => ({
  myEvent: event({
    run: (params, liveInfo) => {
      // Event logic here
      console.log(params.message);
    },
    params: { message: "" as string },
    duration: 1000,  // Optional default duration
    isParallel: false,  // Optional: can run alongside other events
  }),
}));

initEventTypeGroups({
  myGroup: myEvents,
});
```

### Running Events

```typescript
import { runEvents, runEvent, E } from "repond-events";

// Single event
runEvent("myGroup", "myEvent", { message: "Hello" });

// Event chain
runEvents([
  E("myGroup", "event1", { /* params */ }),
  E("myGroup", "event2", { /* params */ }),
], { chainId: "myChain" });
```

### Controlling Events

```typescript
import { eventDo, chainDo } from "repond-events";

// Control individual event
eventDo("pause", liveEventId);
eventDo("skip", liveEventId);
eventDo("cancel", liveEventId);

// Control entire chain
chainDo("pause", chainId);
chainDo("unpause", chainId);
chainDo("cancel", chainId);
```

### Creating Values

```typescript
import { makeValueTypes, initValueTypeGroups, V } from "repond-events";

const myValues = makeValueTypes(({ value }) => ({
  myValue: value({
    run: (params, valueRunInfo) => {
      // Return computed value
      return params.a + params.b;
    },
    params: { a: 0 as number, b: 0 as number },
  }),
}));

initValueTypeGroups({ myGroup: myValues });

// Use it
runEvent("game", "applyDamage", {
  amount: V("myGroup", "myValue", { a: 10, b: 5 })  // Returns 15
});
```

---

## Advanced Features

- **Parallel events** - Run multiple events simultaneously (`isParallel: true`)
- **Fast mode** - Skip lifecycle overhead for performance (`isFast: true`)
- **Priority events** - Jump the queue (`runPriorityEvent`)
- **Scoped variables** - Chain-specific state
- **Event result chaining** - Downstream events use upstream results via `getEventValue`
- **Multiple time paths** - Different event chains can use different time sources

See [Getting Started Examples](docs/getting-started.md) for details.

---

## Future Vision

Repond Events is part of a larger goal: **making game/app logic fully serializable and tweakable at runtime**.

Current:
- ✅ State management (Repond) - serializable reactive state
- ✅ Event orchestration (Repond Events) - serializable event chains

Future:
- 🔮 Serializable effects - reactive state subscriptions as data
- 🔮 Complete runtime editability - tweak logic without touching code

---

## Contributing

Contributions welcome! This library is in active development.

**Ideas for contribution:**
- Built-in conditional value library (if/then, and/or, comparisons)
- JSON validation utilities
- Serialization helpers (`saveChainState()`, `loadChainState()`)
- TypeScript improvements
- More examples and use cases

---

## License

MIT

---

## Credits

Created by [Hugo McPhee](https://github.com/HugoMcPhee)

Built on [Repond](https://github.com/HugoMcPhee/repond) for state management.

---

## Quick Links

- [Getting Started Examples](docs/getting-started.md)
- [API Reference (coming soon)](#)
- [GitHub Issues](https://github.com/HugoMcPhee/repond-events/issues)
- [Repond](https://github.com/HugoMcPhee/repond)
