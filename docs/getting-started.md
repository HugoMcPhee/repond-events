# Getting Started with Repond Events - Examples

## Introduction

This guide provides practical examples to help you understand and use repond-events. We'll start simple and build up to advanced patterns.

---

## Example 1: Basic Event Chain with Logging and Delays

The simplest use case - run a sequence of events with delays.

### Step 1: Define Event Types

```typescript
import { makeEventTypes, initEventTypeGroups } from "repond-events";

// Define event types
const basicEvents = makeEventTypes(({ event }) => ({
  log: event({
    run: ({ message }, liveInfo) => {
      console.log(`[${liveInfo.elapsedTime}ms]`, message);
    },
    params: { message: "" as string },
  }),

  wait: event({
    run: async ({ duration }, liveInfo) => {
      // The event system handles the actual timing
      // This just needs to be defined with the duration
    },
    params: { duration: 1000 as number },
    duration: 1000,  // Default duration
  }),
}));

// Register event types
initEventTypeGroups({
  basic: basicEvents,
});
```

### Step 2: Run a Simple Chain

```typescript
import { runEvents, E } from "repond-events";

// Run a sequence of events
runEvents([
  E("basic", "log", { message: "Starting sequence..." }),
  E("basic", "wait", { duration: 1000 }),
  E("basic", "log", { message: "After 1 second" }),
  E("basic", "wait", { duration: 2000 }),
  E("basic", "log", { message: "After 3 seconds total" }),
  E("basic", "log", { message: "Done!" }),
]);
```

### Output:
```
[0ms] Starting sequence...
[1000ms] After 1 second
[3000ms] After 3 seconds total
[3000ms] Done!
```

### Key Concepts:
- **Event Types** are defined once with `makeEventTypes()`
- **Event Instances** are created with `E(group, name, params)`
- **Sequential execution** - events run in order
- **Timing** - wait events pause the chain

---

## Example 2: Using Values for Dynamic Parameters

Values enable late-binding - parameters are evaluated when the event runs, not when it's defined.

### Step 1: Add Variable Support

```typescript
import { makeEventTypes, setVariable, getVariable } from "repond-events";

const gameEvents = makeEventTypes(({ event }) => ({
  setScore: event({
    run: ({ score }, liveInfo) => {
      console.log(`Setting score to ${score}`);
      setVariable("currentScore", score, liveInfo.chainId);
    },
    params: { score: 0 as number },
  }),

  showScore: event({
    run: ({ score }, liveInfo) => {
      console.log(`Your score: ${score}`);
    },
    params: { score: 0 as number },
  }),
}));
```

### Step 2: Use Values in Event Parameters

```typescript
import { runEvents, E, V } from "repond-events";

runEvents([
  // Set initial score
  E("game", "setScore", { score: 100 }),

  // Show score using a Value (late-binding)
  E("game", "showScore", {
    score: V("basic", "getVariable", {
      name: "currentScore"
    })
  }),

  // Update score
  E("game", "setScore", { score: 250 }),

  // Show updated score
  E("game", "showScore", {
    score: V("basic", "getVariable", {
      name: "currentScore"
    })
  }),
]);
```

### Output:
```
Setting score to 100
Your score: 100
Setting score to 250
Your score: 250
```

### Key Concepts:
- **Values** are created with `V(group, name, params)`
- **Late-binding** - the value is evaluated when the event runs
- **Variables** provide scoped state within chains
- `getVariable` retrieves the current value at runtime

---

## Example 3: Combining Values

Values can be nested and combined to create complex parameters.

### Step 1: Use Combine Value

```typescript
import { runEvents, E, V } from "repond-events";

runEvents([
  E("game", "setScore", { score: 450 }),
  E("game", "setVariable", {
    name: "maxScore",
    value: 1000,
    scope: V("basic", "getMyChainId")
  }),

  E("basic", "log", {
    message: V("basic", "combine", {
      valueA: "Score: ",
      valueB: V("basic", "combine", {
        valueA: V("basic", "getVariable", { name: "currentScore" }),
        valueB: V("basic", "combine", {
          valueA: " / ",
          valueB: V("basic", "getVariable", { name: "maxScore" })
        })
      })
    })
  }),
]);
```

### Output:
```
Score: 450 / 1000
```

### Key Concepts:
- **Nested Values** - Values can contain other Values as parameters
- **Combine** - Concatenates or adds values together
- **Dynamic composition** - Build complex strings/values from simple parts

---

## Example 3.5: Creating Custom Values

You can create your own value types for reusable logic - this is where the real power comes in!

### Step 1: Define Custom Values

```typescript
import { makeValueTypes, initValueTypeGroups, getState } from "repond-events";

const customValues = makeValueTypes(({ value }) => ({
  // Math operations
  multiply: value({
    run: ({ a, b }) => a * b,
    params: { a: 0 as number, b: 0 as number },
  }),

  // Conditional logic
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

  // Read from Repond state
  getStateValue: value({
    run: ({ storeName, itemId, prop }) => {
      return getState(storeName, itemId)?.[prop];
    },
    params: {
      storeName: "" as string,
      itemId: "" as string,
      prop: "" as string,
    },
  }),

  // Format strings with variables
  formatString: value({
    run: ({ template, values }) => {
      return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");
    },
    params: {
      template: "" as string,
      values: {} as Record<string, any>,
    },
  }),
}));

// Register custom values
initValueTypeGroups({
  basic: basicValues,
  custom: customValues,
});
```

### Step 2: Use Custom Values

```typescript
// Math operations
runEvent("game", "applyDamage", {
  amount: V("custom", "multiply", {
    a: 50,
    b: 1.5  // 50 * 1.5 = 75
  })
});

// Conditional logic
runEvent("ui", "showMessage", {
  text: V("custom", "ifThen", {
    condition: V("custom", "getStateValue", {
      storeName: "player",
      itemId: "player1",
      prop: "isHealthy"
    }),
    thenValue: "You're doing great!",
    elseValue: "You need healing!"
  })
});

// Format strings
runEvent("ui", "display", {
  text: V("custom", "formatString", {
    template: "Hello {name}, you have {score} points!",
    values: {
      name: V("basic", "getVariable", { name: "playerName" }),
      score: V("basic", "getVariable", { name: "currentScore" })
    }
  })
});
```

### Step 3: Conditional Event Chains (Most Powerful!)

```typescript
// Create a value that chooses between event chains
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

initValueTypeGroups({ conditional: conditionalValues });

// Use it to create branching logic
runEvent("game", "processPlayerAction", {
  result: V("basic", "getEventValue", {
    events: V("conditional", "chooseChain", {
      // Check if player is healthy
      condition: V("custom", "getStateValue", {
        storeName: "player",
        itemId: "player1",
        prop: "isHealthy"
      }),

      // If healthy, run this chain
      thenChain: [
        E("game", "showDialog", { text: "You feel strong!" }),
        E("game", "grantBuff", { buff: "strength" }),
        E("basic", "returnValue", { value: "success" })
      ],

      // If unhealthy, run this chain
      elseChain: [
        E("game", "showDialog", { text: "You need rest..." }),
        E("game", "applyDebuff", { debuff: "weakness" }),
        E("basic", "returnValue", { value: "failure" })
      ]
    })
  })
});
```

### Key Concepts:
- **Custom values** - Define reusable logic once, use everywhere
- **Conditional logic** - Use custom values to implement if/then/else
- **Conditional chains** - Choose which event chain to run based on conditions
- **Serializable** - Custom values work with JSON (the value definitions are code, but the value instances are data)

---

## Example 4: Event Chaining with getEventValue

One of the most powerful features - run sub-events and use their return value.

### Step 1: Define Events that Return Values

```typescript
const combatEvents = makeEventTypes(({ event }) => ({
  calculateDamage: event({
    run: ({ baseDamage, multiplier }, liveInfo) => {
      const damage = Math.floor(baseDamage * multiplier);
      console.log(`Calculated damage: ${damage}`);
      setVariable("calculatedDamage", damage, liveInfo.chainId);
    },
    params: {
      baseDamage: 10 as number,
      multiplier: 1.0 as number,
    },
  }),

  applyDamage: event({
    run: ({ target, amount }, liveInfo) => {
      console.log(`Applying ${amount} damage to ${target}`);
      // ... actually apply damage
    },
    params: {
      target: "" as string,
      amount: 0 as number,
    },
  }),
}));
```

### Step 2: Use getEventValue to Chain Events

```typescript
import { runEvents, E, V } from "repond-events";

runEvents([
  E("combat", "applyDamage", {
    target: "enemy",
    amount: V("basic", "getEventValue", {
      events: [
        // First, calculate damage
        E("combat", "calculateDamage", {
          baseDamage: 50,
          multiplier: 1.5
        }),
        // Then, return the calculated value
        E("basic", "returnValue", {
          value: V("basic", "getVariable", {
            name: "calculatedDamage"
          })
        })
      ]
    })
  }),
]);
```

### Output:
```
Calculated damage: 75
Applying 75 damage to enemy
```

### Key Concepts:
- **getEventValue** - Runs a sub-chain and captures the return value
- **returnValue** - Marks the value to return from a sub-chain
- **Event result chaining** - Downstream events use upstream results
- **Declarative dependencies** - No manual state passing

---

## Example 5: Custom Time Speed (Slow Motion / Fast Forward)

A key differentiator - events can be tied to custom time sources.

### Step 1: Set Up Time Tracking

```typescript
import { startItemEffect, setState } from "repond";

// Create a state to track elapsed time
const globalState = makeGlobalStore({
  time: {
    elapsed: 0,        // Elapsed milliseconds
    speed: 1.0,        // Time multiplier (1.0 = normal, 0.5 = slow-mo, 2.0 = fast)
    lastUpdate: Date.now(),
  }
});

// Update elapsed time based on speed
startItemEffect({
  name: "updateElapsedTime",
  run: () => {
    const state = getState("global", "time");
    const now = Date.now();
    const delta = now - state.lastUpdate;
    const scaledDelta = delta * state.speed;

    setState("global.elapsed", state.elapsed + scaledDelta, "time");
    setState("global.lastUpdate", now, "time");
  },
  step: "update",  // Run every frame
  check: { type: "repond", prop: ["global", "time", "speed"] },
});
```

### Step 2: Initialize Events with Time Path

```typescript
import { initEventTypeGroups } from "repond-events";

initEventTypeGroups(
  {
    basic: basicEvents,
    game: gameEvents,
  },
  {
    defaultTimePath: ["global", "time", "elapsed"],
  }
);
```

### Step 3: Control Time Speed

```typescript
import { runEvents, E, setState } from "repond-events";

// Normal speed
setState("global.speed", 1.0, "time");
runEvents([
  E("basic", "log", { message: "Normal speed" }),
  E("basic", "wait", { duration: 1000 }),
  E("basic", "log", { message: "1 second passed (real-time)" }),
]);

// Slow motion (0.5x speed)
setState("global.speed", 0.5, "time");
runEvents([
  E("basic", "log", { message: "Slow motion" }),
  E("basic", "wait", { duration: 1000 }),
  E("basic", "log", { message: "1 second passed (2 seconds real-time)" }),
]);

// Fast forward (2x speed)
setState("global.speed", 2.0, "time");
runEvents([
  E("basic", "log", { message: "Fast forward" }),
  E("basic", "wait", { duration: 1000 }),
  E("basic", "log", { message: "1 second passed (0.5 seconds real-time)" }),
]);
```

### Key Concepts:
- **Custom time sources** - Events use Repond state for timing, not `Date.now()`
- **Time multipliers** - Speed up or slow down all events globally
- **Independent time streams** - Different chains can use different time paths
- **Pause support** - Set speed to 0 to pause all events

---

## Example 6: Pausing and Resuming Events

Events can be paused, resumed, and cancelled.

### Step 1: Run a Long Chain

```typescript
import { runEvents, E, eventDo } from "repond-events";

runEvents([
  E("basic", "log", { message: "Step 1" }),
  E("basic", "wait", { duration: 2000 }),
  E("basic", "log", { message: "Step 2" }),
  E("basic", "wait", { duration: 2000 }),
  E("basic", "log", { message: "Step 3" }),
], { chainId: "longChain" });

// After 1 second, pause the chain
setTimeout(() => {
  console.log("Pausing chain...");
  chainDo("pause", "longChain");
}, 1000);

// After 5 seconds, resume the chain
setTimeout(() => {
  console.log("Resuming chain...");
  chainDo("unpause", "longChain");
}, 5000);
```

### Output:
```
Step 1
Pausing chain...
[3 second pause]
Resuming chain...
Step 2
[2 seconds]
Step 3
```

### Key Concepts:
- **chainDo()** - Control entire chains (pause, unpause, cancel)
- **eventDo()** - Control individual events
- **Preserved timing** - When resumed, events continue from where they left off

---

## Example 7: Loading Event Chains from JSON

Events are serializable - you can load them from JSON.

### Step 1: Define JSON Event Chain

```json
{
  "questId": "tutorial_intro",
  "events": [
    {
      "group": "game",
      "name": "showDialog",
      "params": {
        "character": "guide",
        "text": "Welcome to the game!"
      },
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
      "name": "giveItem",
      "params": {
        "item": "wooden_sword",
        "quantity": 1
      },
      "options": {}
    },
    {
      "group": "game",
      "name": "showDialog",
      "params": {
        "character": "guide",
        "text": "Here's a sword to start your journey!"
      },
      "options": {}
    }
  ]
}
```

### Step 2: Load and Run

```typescript
import { runEvents } from "repond-events";

// Load from JSON (could be from server, file, LLM, etc.)
const questData = JSON.parse(jsonString);

// Run it!
runEvents(questData.events, { chainId: `quest_${questData.questId}` });
```

### Step 3: JSON with Values

```json
{
  "events": [
    {
      "group": "game",
      "name": "showDialog",
      "params": {
        "character": "guide",
        "text": {
          "type": "value",
          "group": "basic",
          "name": "combine",
          "params": {
            "valueA": "Welcome, ",
            "valueB": {
              "type": "value",
              "group": "basic",
              "name": "getVariable",
              "params": { "name": "playerName" },
              "options": {}
            }
          },
          "options": {}
        }
      },
      "options": {}
    }
  ]
}
```

### Key Concepts:
- **EventBlocks are plain objects** - fully JSON-compatible
- **ValueBlocks can be in JSON** - nested values work perfectly
- **Event types must be pre-defined** - JSON references them by group/name
- **Perfect for LLM/server-driven content** - generate chains dynamically

---

## Example 8: Save and Restore Event Chains

Serialize entire chain state for save/load functionality.

### Step 1: Save Chain State

```typescript
import { getState, getItemIds } from "repond";

function saveEventChainState(chainId: string): string {
  const chainState = getState("chains", chainId);
  const liveEventIds = chainState.liveEventIds;

  const eventsData = liveEventIds.map(id => {
    const liveEvent = getState("liveEvents", id);
    return {
      event: liveEvent.event,
      evaluatedParams: liveEvent.evaluatedParams,
      nowRunMode: liveEvent.nowRunMode,
      duration: liveEvent.duration,
      addTime: liveEvent.addTime,
      startTime: liveEvent.startTime,
      goalEndTime: liveEvent.goalEndTime,
    };
  });

  return JSON.stringify({
    chainId: chainId,
    events: eventsData,
    variables: chainState.variablesByName,
  });
}
```

### Step 2: Restore Chain State

```typescript
import { setState, runEvents } from "repond-events";

function restoreEventChainState(savedJson: string): void {
  const data = JSON.parse(savedJson);

  // Restore variables
  setState("chains.variablesByName", data.variables, data.chainId);

  // Restore events
  const eventBlocks = data.events.map(e => e.event);
  runEvents(eventBlocks, { chainId: data.chainId });

  // Note: Timing may need adjustment based on current elapsed time
}
```

### Key Concepts:
- **Full state serialization** - chains, events, variables, timing
- **Save/load support** - perfect for games with save systems
- **Cross-device sync** - serialize on one device, restore on another

---

## Example 9: LLM-Generated Event Chains

A powerful use case - let AI generate event sequences.

### Scenario: LLM Generates a Quest

**Prompt to LLM:**
```
Generate a JSON event chain for a simple quest where:
1. An NPC greets the player
2. Asks them to collect 5 apples
3. Waits for the player to complete it
4. Rewards them with gold

Use these event types:
- game.showDialog (params: character, text)
- game.giveQuest (params: questId, objective, count)
- game.waitForQuestComplete (params: questId)
- game.giveReward (params: gold, xp)
- basic.wait (params: duration)
```

**LLM Response:**
```json
{
  "questId": "apple_collection",
  "events": [
    {
      "group": "game",
      "name": "showDialog",
      "params": {
        "character": "farmer",
        "text": "Hello traveler! I need your help."
      },
      "options": {}
    },
    {
      "group": "basic",
      "name": "wait",
      "params": { "duration": 1500 },
      "options": {}
    },
    {
      "group": "game",
      "name": "showDialog",
      "params": {
        "character": "farmer",
        "text": "My apple trees are full, but I can't pick them all myself."
      },
      "options": {}
    },
    {
      "group": "game",
      "name": "giveQuest",
      "params": {
        "questId": "apple_collection",
        "objective": "apples",
        "count": 5
      },
      "options": {}
    },
    {
      "group": "game",
      "name": "waitForQuestComplete",
      "params": { "questId": "apple_collection" },
      "options": {}
    },
    {
      "group": "game",
      "name": "showDialog",
      "params": {
        "character": "farmer",
        "text": "Thank you so much! Here's your reward."
      },
      "options": {}
    },
    {
      "group": "game",
      "name": "giveReward",
      "params": {
        "gold": 100,
        "xp": 50
      },
      "options": {}
    }
  ]
}
```

**Run it:**
```typescript
const llmQuest = await fetch("/api/llm/generate-quest").then(r => r.json());
runEvents(llmQuest.events, { chainId: `quest_${llmQuest.questId}` });
```

### Key Concepts:
- **AI-generated content** - LLMs can create valid event chains
- **No code compilation** - works on iOS and restricted platforms
- **Dynamic content updates** - change quests without app updates
- **Personalization** - generate unique quests per player

---

## Example 10: Offline API Queue

Queue API calls as events - perfect for offline-first apps.

### Step 1: Define API Events

```typescript
const apiEvents = makeEventTypes(({ event }) => ({
  createUser: event({
    run: async ({ name, email }, liveInfo) => {
      try {
        const response = await fetch("/api/users", {
          method: "POST",
          body: JSON.stringify({ name, email }),
        });
        const data = await response.json();
        setVariable("lastUserId", data.id, liveInfo.chainId);
        console.log("User created:", data.id);
      } catch (error) {
        console.error("Failed to create user:", error);
        // Could retry or handle error
      }
    },
    params: { name: "", email: "" },
  }),

  uploadPhoto: event({
    run: async ({ url }, liveInfo) => {
      const userId = getVariable("lastUserId", liveInfo.chainId);
      await fetch(`/api/users/${userId}/photos`, {
        method: "POST",
        body: JSON.stringify({ url }),
      });
      console.log("Photo uploaded");
    },
    params: { url: "" },
  }),
}));
```

### Step 2: Queue Offline Operations

```typescript
import { runEvents, E } from "repond-events";

// User performs actions while offline
runEvents([
  E("api", "createUser", {
    name: "Alice",
    email: "alice@example.com"
  }),
  E("api", "uploadPhoto", {
    url: "https://example.com/photo.jpg"
  }),
  E("api", "updateProfile", {
    bio: "Hello world!"
  }),
], { chainId: "offlineQueue" });

// When offline, save the queue
if (!navigator.onLine) {
  const saved = saveEventChainState("offlineQueue");
  localStorage.setItem("offlineQueue", saved);
}

// When back online, restore and continue
window.addEventListener("online", () => {
  const saved = localStorage.getItem("offlineQueue");
  if (saved) {
    restoreEventChainState(saved);
    localStorage.removeItem("offlineQueue");
  }
});
```

### Key Concepts:
- **Offline-first** - Queue operations while offline
- **Automatic retry** - Events continue when back online
- **Serializable queue** - Save to localStorage/IndexedDB
- **Ordered operations** - Events execute sequentially

---

## Summary of Key Patterns

| Pattern | Use Case | Key Feature |
|---------|----------|-------------|
| **Sequential Events** | Tutorials, cutscenes | Events run in order |
| **Values** | Dynamic parameters | Late-binding evaluation |
| **Custom Values** | Reusable logic | Define your own value types |
| **Conditional Logic** | Branching | Use custom values for if/then/else |
| **getEventValue** | Event chaining | Downstream events use upstream results |
| **Custom Time** | Slow-motion, pause | Events tied to custom time source |
| **Pause/Resume** | Game menus | Control event flow |
| **JSON Loading** | Dynamic content | Load events from JSON |
| **Serialization** | Save/load | Persist chain state |
| **LLM Generation** | AI content | Generate events dynamically |
| **Offline Queue** | Offline-first apps | Queue async operations |

---

## Next Steps

1. **Read the guide documents:**
   - [Serialization Guide](serialization-guide.md) - Deep dive into serialization
   - [Values Guide](values-guide.md) - Comprehensive Values guide
   - [Conditional Logic](conditional-logic.md) - Conditional logic patterns
   - [JSON Events](json-events.md) - JSON event definition

2. **Try these examples** in your own project

3. **Explore advanced features:**
   - Parallel events (`isParallel: true`)
   - Fast mode (`isFast: true`)
   - Priority events (`runPriorityEvent`)
   - Multiple time paths (game time vs. UI time)

4. **Build your own event types** for your specific use case

Happy event orchestration!
