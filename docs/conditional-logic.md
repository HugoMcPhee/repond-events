# Conditional Logic Research - Repond Events

## Executive Summary

**UPDATE:** Conditional logic **IS POSSIBLE** through custom values!

**What IS supported:**
- ✅ **Conditional values** - Create custom values that return different results based on conditions
- ✅ **Conditional event chains** - Use custom values with `getEventValue` to run different chains
- ✅ **Conditional parameters** - Any event parameter can use conditional values
- ✅ Sequential event execution
- ✅ Event skipping (imperative, not declarative)
- ✅ Late-binding values (can compute conditional results via sub-chains)
- ✅ Variable-based parameterization

**What is NOT supported (built-in):**
- ❌ Built-in if/else event types (but you can create custom values for this!)
- ❌ Built-in conditional branching (but custom values enable this!)
- ❌ Declarative conditional event filtering

**Key Insight:** While there are no built-in conditional events, the Values system is powerful enough to implement any conditional logic you need through custom value definitions.

---

## 1. Conditional Events - NOT SUPPORTED

### Finding: No Built-In Conditional Events

**Evidence:** All built-in events are in [src/events/basic.ts](src/events/basic.ts)

Available events:
- `wait` - Delays for a duration
- `log` - Logs to console
- `setState` - Sets Repond state
- `setVariable` - Sets scoped variables
- `returnValue` - Returns a value from a chain

**None of these provide if/else branching.**

### Run Modes - No Conditional Modes

**Location:** [src/types.ts:12](src/types.ts#L12)

```typescript
export type RunMode =
  | "add"
  | "start"
  | "end"
  | "pause"
  | "unpause"
  | "suspend"
  | "unsuspend"
  | "cancel"
  | "skip";
```

**Analysis:**
- 9 run modes exist
- All control lifecycle (pause, skip, cancel)
- None provide conditional branching
- No "if", "branch", "switch", or "conditional" modes

---

## 2. Conditional Values - PARTIAL SUPPORT

### Finding: Values Cannot Directly Represent Conditionals

**Evidence:** Built-in values from [src/events/values/basic.ts](src/events/values/basic.ts):

- `combine` - Concatenates/adds values
- `string` - Identity function
- `getVariable` - Retrieves variables
- `getMyChainId` - Returns current chain ID
- `getEventValue` - Executes sub-chain and returns result

**None of these are conditional values** (no ternary, if/else, switch, etc.).

### Workaround: Conditional Logic via `getEventValue`

You CAN implement conditional logic indirectly:

```typescript
// Create a custom event that checks a condition
const conditionalEvents = makeEventTypes(({ event }) => ({
  checkCondition: event({
    run: ({ threshold }, {}) => {
      const currentValue = getState("game", "gameState").score;
      const result = currentValue > threshold ? "high" : "low";
      setVariable("conditionResult", result);
    },
    params: { threshold: 100 },
  }),
}));

// Use it via getEventValue
runEvent("game", "processScore", {
  message: V("basic", "getEventValue", {
    events: [
      E("conditional", "checkCondition", { threshold: 100 }),
      E("basic", "returnValue", {
        value: V("basic", "getVariable", { name: "conditionResult" })
      })
    ]
  })
});
```

**Limitations:**
- Requires custom event definitions
- Both branches must be pre-defined in code (not data)
- Not true branching - you're computing a value, not choosing a path
- The event chain structure is fixed

---

## 3. Event Filtering - IMPERATIVE SKIP ONLY

### Finding: Skip Mode Exists, But Requires Manual Triggering

**Evidence:** [src/helpers.ts:187-201](src/helpers.ts#L187-L201)

```typescript
export function skipToEvent(liveId: string, runOptions?: RunModeExtraOptions) {
  doForAllBeforeEvent("skip", liveId, runOptions);
}

export function cancelUpToEvent(liveId: string, runOptions?: RunModeExtraOptions) {
  doForAllBeforeEvent("cancel", liveId, runOptions);
}

export function doForAllBeforeEvent(runMode: RunMode, liveId: string, runOptions?: RunModeExtraOptions) {
  onNextTick(() => {
    whenSettingStates(() => {
      const targetLiveIds = getLiveEventsIdsUpToLiveEventId(liveId);
      _setStatesToRunEventsInMode({ runMode, targetLiveIds, runOptions });
    });
  });
}
```

**What this means:**
- You can skip events in a chain
- You can cancel events up to a specific point
- But this is **imperative** - you must call these functions from outside the event system
- There's no declarative "skip if condition X" syntax

### Skip Handling in Internal Logic

**Location:** [src/internal.ts:603-610](src/internal.ts#L603-L610)

```typescript
if (liveEventState.runModeOptionsWhenReady) {
  const { runMode: readyRunMode, options: readyRunOptions } = liveEventState.runModeOptionsWhenReady;
  setState(`liveEvents.runModeOptionsWhenReady`, undefined, liveEventId);
  eventDo(readyRunMode, liveEventId, readyRunOptions);
  return;
}
```

**Analysis:**
- Skip is triggered by setting `runModeOptionsWhenReady`
- This is done externally via `eventDo("skip", liveId)`
- No automatic conditional skipping exists

---

## 4. State-Based Branching - NOT SUPPORTED

### Finding: Events Cannot Branch Based on State

**Evidence:** Chain execution flow from [src/effects/chains.ts](src/effects/chains.ts) and [src/internal.ts](src/internal.ts)

**How events execute:**
1. Event is added to chain's `liveEventIds` array
2. Chain effect detects new event
3. Event is activated (if `canAutoActivate`)
4. Event handler runs
5. Next event in array runs

**No branching mechanism exists.**

### Chain State Structure

**Location:** [src/stores/chains.ts](src/stores/chains.ts)

```typescript
export type ChainState = {
  id: string;
  liveEventIds: string[];        // ← Simple array, not a tree
  parentChainId: string;
  canAutoActivate: boolean;
  duplicateEventsToAdd: Record<...>;
  variablesByName: Record<string, any>;
};
```

**Analysis:**
- `liveEventIds` is a flat array
- No branching structure (no "if this, run these events; else run those events")
- Events execute in linear order (with parallel support via `isParallel`)

### Parameter Evaluation - No Dynamic Branching

**Location:** [src/internal.ts:195-209](src/internal.ts#L195-L209)

```typescript
let evaluatedParams = liveEventState.evaluatedParams;

if (!evaluatedParams || (runMode === "start" && liveInfo.isFirstStart)) {
  evaluatedParams = await evaluateParams(paramsWithDefaults, {
    addedBy: liveInfo.addedBy,
    runBy: liveInfo.runBy,
    parentChainId: liveInfo.chainId,
    valueIdBase: liveInfo.liveId,
  });
}

// Run event handler with evaluated params
if (evaluatedParams) {
  eventHandler(evaluatedParams, liveInfo);
  setState(`liveEvents.evaluatedParams`, evaluatedParams, liveEventId);
}
```

**Analysis:**
- Parameters are evaluated at event start
- Event handler always runs (if params evaluate)
- No mechanism to skip event based on parameter values
- No dynamic path selection

---

## 5. Future Plans - NO CONDITIONAL SUPPORT PLANNED

### Search Results: No Conditional TODOs

**Searched for:**
- "TODO" + "conditional"
- "TODO" + "if"
- "TODO" + "branch"
- Comments with "condition"
- Incomplete conditional implementations

**Found:**
- Various TODOs about `isFast` mode ([src/internal.ts](src/internal.ts))
- TODOs about fast mode promise handling ([src/events/values/basic.ts:40](src/events/values/basic.ts#L40))
- TODOs about `parentChainId` updates ([src/stores/chains.ts](src/stores/chains.ts))

**NOT found:**
- Zero TODOs about conditionals
- Zero commented-out conditional code
- Zero type definitions for conditionals
- Zero placeholder functions for branching

### No Conditional Types Defined

**Searched [src/types.ts](src/types.ts) for:**
- `ConditionalEvent`
- `BranchEvent`
- `IfElseEvent`
- `ConditionalValue`
- `Predicate`
- `Condition`

**Result:** None of these types exist.

---

## 6. Architectural Analysis

### Why Conditionals Aren't Supported

**1. Linear Chain Structure**

From [src/stores/chains.ts](src/stores/chains.ts):
```typescript
liveEventIds: string[];  // Flat array
```

**Implication:** Chains store events in a simple array. There's no tree/graph structure to represent branches.

**2. Event Definitions Are Functions (Not Serializable Conditionals)**

From [src/types.ts](src/types.ts):
```typescript
export type EventTypeDefinition<T_Params extends Record<any, any>> = {
  run: (params: T_Params, liveInfo: LiveInfo) => void | Promise<void>;
  // ...
};
```

**Implication:** Event logic is in `run` functions (JavaScript code), not serializable data structures.

To support serializable conditionals, you'd need a data-driven DSL like:
```typescript
{
  type: "conditional",
  condition: { /* serializable predicate */ },
  thenEvents: [ /* events */ ],
  elseEvents: [ /* events */ ]
}
```

**This doesn't exist.**

**3. Skip Mode is External**

From [src/helpers.ts](src/helpers.ts):
```typescript
export function skipToEvent(liveId: string, runOptions?: RunModeExtraOptions) { /* ... */ }
```

**Implication:** Skipping is triggered by external function calls, not by the event system itself.

---

## 7. Implementing Conditionals with Custom Values ✅

### The Solution: Custom Conditional Values

While there are no built-in conditional events, **you can create custom values that implement conditional logic**. Since values are evaluated at runtime and can return different results based on conditions, they enable full conditional branching.

### Pattern 1: Simple Conditional Value

**Create a conditional value:**

```typescript
import { makeValueTypes, getState } from "repond-events";

const conditionalValues = makeValueTypes(({ value }) => ({
  // Simple if/then/else
  choose: value({
    run: ({ condition, ifTrue, ifFalse }) => {
      return condition ? ifTrue : ifFalse;
    },
    params: {
      condition: false as boolean,
      ifTrue: undefined as any,
      ifFalse: undefined as any,
    },
  }),

  // Check state and return value
  checkHealth: value({
    run: ({ threshold, healthyValue, unhealthyValue }) => {
      const health = getState("player", "player1").health;
      return health > threshold ? healthyValue : unhealthyValue;
    },
    params: {
      threshold: 50 as number,
      healthyValue: undefined as any,
      unhealthyValue: undefined as any,
    },
  }),
}));

initValueTypeGroups({ conditional: conditionalValues });
```

**Use it in event parameters:**

```typescript
// Conditional parameter
runEvent("game", "applyEffect", {
  effectType: V("conditional", "choose", {
    condition: V("game", "isPlayerHealthy"),
    ifTrue: "healing",
    ifFalse: "damage"
  })
});

// Direct state check
runEvent("ui", "showMessage", {
  text: V("conditional", "checkHealth", {
    threshold: 50,
    healthyValue: "You're doing great!",
    unhealthyValue: "You need healing!"
  })
});
```

### Pattern 2: Conditional Event Chains

**Most powerful - choose which event chain to run:**

```typescript
const conditionalValues = makeValueTypes(({ value }) => ({
  // Choose between two event chains
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

**Use with getEventValue to run conditional chains:**

```typescript
runEvent("game", "processPlayerAction", {
  result: V("basic", "getEventValue", {
    events: V("conditional", "chooseChain", {
      condition: V("game", "isPlayerHealthy"),

      // If healthy, run this chain
      thenChain: [
        E("game", "showMessage", { text: "You feel strong!" }),
        E("game", "grantBuff", { buff: "strength" }),
        E("basic", "returnValue", { value: "success" })
      ],

      // If unhealthy, run this chain
      elseChain: [
        E("game", "showMessage", { text: "You need rest..." }),
        E("game", "applyDebuff", { debuff: "weakness" }),
        E("basic", "returnValue", { value: "failure" })
      ]
    })
  })
});
```

**This gives you true conditional branching!**

### Pattern 3: Complex Conditional Logic

**Create more sophisticated conditional values:**

```typescript
const conditionalValues = makeValueTypes(({ value }) => ({
  // Multiple conditions (switch-like)
  switch: value({
    run: ({ value, cases, defaultCase }) => {
      return cases[value] ?? defaultCase;
    },
    params: {
      value: "" as any,
      cases: {} as Record<string, any>,
      defaultCase: undefined as any,
    },
  }),

  // Boolean logic
  and: value({
    run: ({ conditions }) => {
      return conditions.every(c => c);
    },
    params: {
      conditions: [] as boolean[],
    },
  }),

  or: value({
    run: ({ conditions }) => {
      return conditions.some(c => c);
    },
    params: {
      conditions: [] as boolean[],
    },
  }),

  not: value({
    run: ({ condition }) => {
      return !condition;
    },
    params: {
      condition: false as boolean,
    },
  }),

  // Comparison operators
  greaterThan: value({
    run: ({ a, b }) => a > b,
    params: { a: 0 as number, b: 0 as number },
  }),

  equals: value({
    run: ({ a, b }) => a === b,
    params: { a: undefined as any, b: undefined as any },
  }),
}));
```

**Use them together for complex logic:**

```typescript
runEvent("game", "processAction", {
  result: V("basic", "getEventValue", {
    events: V("conditional", "chooseChain", {
      // Complex condition using multiple values
      condition: V("conditional", "and", {
        conditions: [
          V("conditional", "greaterThan", {
            a: V("basic", "getVariable", { name: "playerHealth" }),
            b: 50
          }),
          V("conditional", "equals", {
            a: V("basic", "getVariable", { name: "playerLevel" }),
            b: 10
          })
        ]
      }),
      thenChain: [ /* events if condition true */ ],
      elseChain: [ /* events if condition false */ ]
    })
  })
});
```

### Pattern 4: Serializable Conditionals

**The best part - this is all JSON-serializable!**

```json
{
  "group": "game",
  "name": "applyEffect",
  "params": {
    "effectType": {
      "type": "value",
      "group": "conditional",
      "name": "choose",
      "params": {
        "condition": {
          "type": "value",
          "group": "conditional",
          "name": "greaterThan",
          "params": {
            "a": {
              "type": "value",
              "group": "basic",
              "name": "getVariable",
              "params": { "name": "playerHealth" },
              "options": {}
            },
            "b": 50
          },
          "options": {}
        },
        "ifTrue": "healing",
        "ifFalse": "damage"
      },
      "options": {}
    }
  },
  "options": {}
}
```

**This means:**
- ✅ LLMs can generate conditional logic
- ✅ Server can send conditional event chains
- ✅ Conditionals work on iOS (no code compilation)
- ✅ Save/load conditional event chains

### Summary: Conditionals ARE Possible!

**What you can do with custom values:**
- ✅ If/then/else logic
- ✅ Switch/case statements
- ✅ Boolean logic (and, or, not)
- ✅ Comparison operators
- ✅ Conditional event chain selection
- ✅ Complex nested conditions
- ✅ All serializable to JSON

**The pattern:**
1. Define custom conditional values (once, in code)
2. Use them in event parameters (can be JSON)
3. Values are evaluated at runtime
4. Different logic paths execute based on conditions

**This is more powerful than built-in conditionals** because:
- You define exactly the conditionals you need
- They're composable (nest values)
- They're serializable (JSON-compatible)
- They work with the rest of the Values system

---

## 8. Workarounds for Conditional Behavior (Legacy Patterns)

**NOTE:** The patterns below are the "old way" of doing conditionals before realizing custom values solve this elegantly. The custom value patterns above are recommended instead.

### Option 1: Custom Events with Conditional Logic (Not Recommended)

### Option 1: Custom Events with Conditional Logic

**Pattern:** Create events that check conditions and set variables.

```typescript
const conditionalEvents = makeEventTypes(({ event }) => ({
  checkHealth: event({
    run: ({ threshold }, {}) => {
      const health = getState("player", "player1").health;
      if (health < threshold) {
        setVariable("healthStatus", "low");
        // Maybe trigger different events here?
        runEvent("ui", "showWarning", { message: "Low health!" });
      } else {
        setVariable("healthStatus", "high");
      }
    },
    params: { threshold: 50 },
  }),
}));
```

**Pros:**
- Works today
- Full JavaScript logic inside event handlers

**Cons:**
- Logic is in code, not serializable
- Event chain doesn't "branch" - you're just running different events from inside an event
- Hard to reason about the chain structure

### Option 2: Imperative Skip Calls

**Pattern:** From outside the event system, skip events based on conditions.

```typescript
// Define chain with all possible events
runEvents([
  E("game", "checkCondition", {}),
  E("game", "optionA", {}),
  E("game", "optionB", {}),
  E("game", "continue", {}),
], { chainId: "myChain" });

// Externally, check condition and skip unwanted events
const chainState = getState("chains", "myChain");
const firstEventId = chainState.liveEventIds[1];  // optionA
const secondEventId = chainState.liveEventIds[2]; // optionB

if (someCondition) {
  skipToEvent(secondEventId);  // Skips optionA, runs optionB
} else {
  eventDo("skip", secondEventId);  // Skips optionB
}
```

**Pros:**
- Uses built-in skip functionality
- Clear control flow

**Cons:**
- Imperative, not declarative
- Requires knowledge of event IDs
- Fragile (event order changes break it)
- Not serializable

### Option 3: Dynamic Event Addition

**Pattern:** Conditionally add events to a chain.

```typescript
const baseEvents = [
  E("game", "setup", {}),
];

const conditionalEvents = someCondition
  ? [E("game", "branchA", {})]
  : [E("game", "branchB", {})];

const finalEvents = [
  E("game", "cleanup", {}),
];

runEvents([...baseEvents, ...conditionalEvents, ...finalEvents]);
```

**Pros:**
- Declarative
- Easy to reason about

**Cons:**
- Condition must be evaluated when *defining* the chain, not when *running* it
- Not late-binding
- Not serializable (JavaScript conditionals)

### Option 4: Separate Chains for Branches

**Pattern:** Run different chains based on conditions.

```typescript
// Check condition
const shouldRunA = /* some check */;

if (shouldRunA) {
  runEvents([
    E("game", "branchA_step1", {}),
    E("game", "branchA_step2", {}),
  ], { chainId: "branchA" });
} else {
  runEvents([
    E("game", "branchB_step1", {}),
    E("game", "branchB_step2", {}),
  ], { chainId: "branchB" });
}
```

**Pros:**
- Clear separation
- Each branch is independent

**Cons:**
- Imperative (if/else in code)
- Not serializable
- Loses single unified chain structure

---

## 9. Future Enhancement Ideas

### Built-in Conditional Value Library

While custom conditional values work perfectly, the library could provide a standard set of conditional values out-of-the-box:

```typescript
// Potential built-in conditional values
import { conditionalValues } from "repond-events/conditionals";

initValueTypeGroups({
  conditional: conditionalValues,  // Includes: choose, and, or, not, greaterThan, etc.
  basic: basicValues,
});
```

This would save developers from re-implementing common conditional patterns.

**3. Branch Chain Structure**

Instead of:
```typescript
liveEventIds: string[];  // Linear
```

Would need:
```typescript
liveEventIds: Array<string | BranchNode>;

type BranchNode = {
  type: "branch";
  condition: ValueBlock;
  thenEvents: string[];
  elseEvents: string[];
};
```

**This would be a significant architectural change.**

---

## 9. Comparison to Other Systems

### State Machines

**Libraries:** XState, Robot

**Conditionals:**
- State machines have explicit branching based on state and events
- Transitions define "if in state X and event Y, go to state Z"

**Difference from repond-events:**
- repond-events is sequential event execution
- State machines are state-driven with conditional transitions

### Saga Patterns

**Libraries:** Redux-Saga

**Conditionals:**
- Saga generators can use JavaScript if/else
- `take`, `put`, `call` are composable

**Difference from repond-events:**
- Sagas use generator functions (not serializable)
- repond-events aims for serializable event chains

### Animation Libraries

**Libraries:** GSAP, Framer Motion

**Conditionals:**
- Animation timelines are sequential
- Conditionals are handled in code, not declaratively

**Similar to repond-events:**
- Sequential execution
- Timing-based
- Limited conditional support

---

## 10. Summary

### Current State

| Feature | Status | Evidence |
|---------|--------|----------|
| **If/Else Events** | ❌ Not Supported | No conditional event type in [src/events/basic.ts](src/events/basic.ts) |
| **Conditional Values** | ⚠️ Partial (Via Events) | `getEventValue` allows computed conditional results |
| **Declarative Branching** | ❌ Not Supported | Chains are linear arrays ([src/stores/chains.ts](src/stores/chains.ts)) |
| **Event Skipping** | ✅ Yes (Imperative) | `skipToEvent()` in [src/helpers.ts](src/helpers.ts) |
| **State-Based Branching** | ❌ Not Supported | No branch logic in [src/internal.ts](src/internal.ts) |
| **Planned Conditionals** | ❌ No Evidence | Zero TODOs found |

### Recommendations

**For Library Users (Recommended):**
1. ✅ **Use custom conditional values** - Create your own conditional value types (see Section 7)
2. ✅ Use `getEventValue` with conditional values to branch event chains
3. ✅ Compose complex logic with nested conditional values
4. ⚠️ Use `skipToEvent()` for imperative branching (only if needed)
5. ⚠️ Use custom events with JavaScript if/else logic (only if needed)

**For Library Developers (Future):**
1. Consider adding built-in conditional value library
2. Provide common predicate values (greaterThan, equals, and, or, not)
3. Add examples/patterns for conditional logic to docs
4. Ensure conditional values remain serializable (already are!)

### Conclusion

**UPDATE:** repond-events **DOES support conditional logic** through custom values!

The architecture prioritizes:
- ✅ Serialization
- ✅ Late-binding values (which enable conditionals!)
- ✅ Timing control (pause, resume, slow-motion)
- ✅ Composability and extensibility

**Conditionals are fully supported via custom values:**
- Create conditional value types that evaluate conditions at runtime
- Use them with `getEventValue` to select which event chains run
- Compose complex boolean logic with nested values
- Everything remains serializable and JSON-compatible

**This is actually MORE powerful than built-in conditionals** because:
- You define exactly the conditionals you need
- They're composable and reusable
- They're serializable (work with LLMs, server-driven content)
- They integrate seamlessly with the Values system
