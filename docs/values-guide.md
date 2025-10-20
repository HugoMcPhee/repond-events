# Values System Research - Repond Events

## Executive Summary

**Values** are a system for representing **deferred, dynamic computations** within event parameters. They enable late-binding, functional composition, and event result chaining.

**Key Insight:** Instead of passing static values to events, you pass Value objects that get evaluated *at event runtime*, enabling:
- Dynamic parameter resolution
- Event result chaining (downstream events can depend on upstream results)
- Reusable, composable event definitions
- Scoped variable access with late binding

---

## 1. What Are Values?

### The Problem They Solve

**Without Values (Static/Imperative):**
```typescript
// Fixed at definition time
const currentTime = Date.now();
runEvent("game", "wait", { until: currentTime + 5000 });

// Manual state passing between events
runEvent("game", "attackEnemy", { damage: 10 });
// In event handler - must manually chain:
const result = calculateDamage(enemy);
runEvent("game", "applyDamage", { amount: result });
```

**Issues:**
- Tight coupling between events
- Parameters are fixed when events are defined, not when they run
- Manual state management between events
- Hard to reuse event chains in different contexts
- Difficult to compose events declaratively

**With Values (Dynamic/Declarative):**
```typescript
// Evaluated at runtime
runEvent("game", "applyDamage", {
  amount: V("basic", "getVariable", { name: "currentDamage" })
});

// Event chaining - downstream events automatically get upstream results
runEvent("game", "applyDamage", {
  amount: V("basic", "getEventValue", {
    events: [
      E("game", "calculateDamage", { enemy: target }),
      E("basic", "returnValue", { value: V("basic", "getVariable", { name: "result" }) })
    ]
  })
});
```

### Key Benefits

1. **Late-Binding** - Values are evaluated when events *run*, not when they're *defined*
2. **Composition** - Values can be nested and combined
3. **Reusability** - Same event definition works in different contexts
4. **Serializability** - Values are data, not code (can be saved/loaded)
5. **Event Chaining** - Events can return values to be used by subsequent events

---

## 2. How Values Work

### ValueBlock Structure

**Location:** [src/types.ts:176-182](src/types.ts#L176-L182)

```typescript
export type ValueBlock = {
  group: string;              // Namespace (e.g., "basic")
  name: string;               // Value function name (e.g., "combine")
  params?: Record<any, any>;  // Parameters (can contain nested ValueBlocks)
  options: ValueBlockOptions; // Runtime context (chainId, isFast, etc.)
  type: "value";              // Distinguishes from EventBlocks
};
```

### ValueTypeDefinition Structure

**Location:** [src/types.ts:200-205](src/types.ts#L200-L205)

```typescript
export type ValueTypeDefinition<T_Params extends Record<any, any>> = {
  run: (evaluatedParams: T_Params, liveInfo: ValueRunInfo) => any;
  params: T_Params;  // Default parameter values
  id?: string;       // Auto-set to "groupName_valueName"
};
```

### Creating ValueBlocks

**Helper function:** `makeValue()` (alias: `V()`, `I_()`)

**Location:** [src/helpers.ts:358-386](src/helpers.ts#L358-L386)

```typescript
const myValue = makeValue("basic", "combine", {
  valueA: "Hello ",
  valueB: "World"
});

// Shorthand alias
const myValue = V("basic", "combine", {
  valueA: "Hello ",
  valueB: "World"
});
```

### Evaluation Timeline

**When are values evaluated?**

**Answer: At event runtime**, specifically during `runEventHandler()`.

**Evidence:** [src/internal.ts:195-209](src/internal.ts#L195-L209)

```typescript
// In runEventHandler()
let evaluatedParams = liveEventState.evaluatedParams;

// Re-evaluate on first start
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

**Key Timing:**
- Values are evaluated when `runMode === "start"` AND `isFirstStart === true`
- This enables fresh computation at event start time
- Evaluated params are cached in `liveEventState.evaluatedParams`

---

## 3. Value Evaluation Process

### Complete Evaluation Flow

```
1. runEventHandler(liveEventId)  [internal.ts:134-220]
   |
   └─> Determine if params need evaluation
       (true if !evaluatedParams OR (runMode === "start" AND isFirstStart))
       |
       v
2. evaluateParams(paramsWithDefaults, info)  [valueHelpers.ts:48-70]
   |
   └─> For each parameter [key, value]:
       |
       v
3. evaluateValue(value, valueRunInfo)  [valueHelpers.ts:9-23]
   |
   ├─> Is it a primitive? → Return as-is
   ├─> Is it a ValueBlock? → evaluateValueBlock()
   └─> Is it a plain object? → Return as-is
       |
       v
4. evaluateValueBlock(valueBlock, valueRunInfo)  [valueHelpers.ts:72-92]
   |
   ├─> Look up valueDefinition in repondEventsMeta.allValueTypeGroups
   ├─> Merge default params with provided params
   ├─> Recursively call evaluateParams() on merged params
   │   (This enables nested values!)
   │
   ├─> If evaluatedParams is a Promise:
   │   └─> return evaluatedParams.then(params => valueDefinition.run(params, valueRunInfo))
   │
   └─> Else:
       └─> return valueDefinition.run(evaluatedParams, valueRunInfo)
```

### Key Helper Functions

#### `evaluateValue()` - Entry Point

**Location:** [src/valueHelpers.ts:9-23](src/valueHelpers.ts#L9-L23)

```typescript
export function evaluateValue(
  rawValue: RawValue | ValueBlock,
  valueRunInfo: ValueRunInfo,
  options: { isFast?: boolean } = {}
): RawValue | Promise<RawValue> {
  if (typeof rawValue !== "object" || rawValue === null) {
    return rawValue;  // Primitives returned as-is
  }

  if (isValueBlock(rawValue)) {
    return evaluateValueBlock(rawValue, valueRunInfo);  // Evaluate ValueBlocks
  }

  return rawValue;  // Plain objects returned as-is
}
```

#### `evaluateParams()` - Handles Nested Values and Promises

**Location:** [src/valueHelpers.ts:48-70](src/valueHelpers.ts#L48-L70)

```typescript
export function evaluateParams(
  params: ParamMap,
  info: EvaluateParamsInfo
): ParamMap | Promise<ParamMap> {
  const paramEntries = Object.entries(params ?? {});

  // Evaluate each parameter
  const evaluatedEntries = paramEntries.map(([key, value]) => {
    const valueRunInfo = getValueRunInfoForParam(info, key);
    const evaluatedValue = evaluateValue(value, valueRunInfo);  // Recursive!
    return [key, evaluatedValue];
  });

  // Detect if any params are promises
  const hasAsyncParam = evaluatedEntries.some(([, value]) => value instanceof Promise);

  if (hasAsyncParam) {
    // Wait for all promises to resolve
    return Promise.all(
      evaluatedEntries.map(([key, value]) =>
        value instanceof Promise ? value.then((resolved) => [key, resolved]) : Promise.resolve([key, value])
      )
    ).then((entries) => Object.fromEntries(entries));
  } else {
    return Object.fromEntries(evaluatedEntries);
  }
}
```

#### `evaluateValueBlock()` - Executes Value Functions

**Location:** [src/valueHelpers.ts:72-92](src/valueHelpers.ts#L72-L92)

```typescript
export function evaluateValueBlock(
  valueBlock: ValueBlock,
  valueRunInfo: ValueRunInfo
): RawValue | Promise<RawValue> {
  const valueDefinition = repondEventsMeta.allValueTypeGroups[valueBlock.group]?.[valueBlock.name];

  if (!valueDefinition) {
    console.warn(`Value type ${valueBlock.group}:${valueBlock.name} not found`);
    return undefined;
  }

  const paramsInfo = getEvaluateParamsInfoFromValueRunInfo(valueRunInfo);
  const paramsWithDefaults = { ...valueDefinition.params, ...valueBlock.params };
  const evaluatedParamsOrPromise = evaluateParams(paramsWithDefaults, paramsInfo);

  if (evaluatedParamsOrPromise instanceof Promise) {
    return evaluatedParamsOrPromise.then((evaluatedParams) => {
      return valueDefinition.run(evaluatedParams, valueRunInfo, valueBlock);
    });
  } else {
    return valueDefinition.run(evaluatedParamsOrPromise, valueRunInfo, valueBlock);
  }
}
```

### Nested Values Support

**YES** - Values can contain other values as parameters.

**Example from built-in values:** [src/events/values/basic.ts:19-28](src/events/values/basic.ts#L19-L28)

```typescript
getVariable: value({
  run: ({ name, scope }, { isFast }) => {
    return getVariable(name, scope, { isFast });
  },
  params: {
    name: "",
    scope: {
      type: "value",
      group: "basic",
      name: "getMyChainId"  // ← Nested value!
    } as unknown as string | undefined,
  },
}),
```

Here, the `scope` parameter defaults to a nested ValueBlock that calls `getMyChainId()`.

### Async Values Support

**Infrastructure exists** - the evaluation system handles Promises:

**Location:** [src/valueHelpers.ts:85-92](src/valueHelpers.ts#L85-L92)

```typescript
// Value functions can return Promises
if (evaluatedParamsOrPromise instanceof Promise) {
  return evaluatedParamsOrPromise.then((evaluatedParams) => {
    const result = valueDefinition.run(evaluatedParams, valueRunInfo, valueBlock);
    return result;  // Can also be a Promise!
  });
}
```

**Note:** Comment at line 82-83 suggests async values may be deprecated:
```typescript
// NOTE this won't be possible anymore, since there's no async values
```

---

## 4. Built-In Values

All built-in values are defined in [src/events/values/basic.ts](src/events/values/basic.ts).

### `combine`

**Purpose:** Concatenates or adds two values

**Definition:** [basic.ts:6-11](src/events/values/basic.ts#L6-L11)
```typescript
combine: value({
  run: ({ valueA, valueB }, { valueId, parentChainId }) => {
    return valueA + valueB;
  },
  params: { valueA: "", valueB: "" },
}),
```

**Use cases:**
- Combining strings: `"Hello " + "World"`
- Adding numbers: `10 + 5`
- Array concatenation (via `+` coercion)

**Example:**
```typescript
V("basic", "combine", {
  valueA: "Player ",
  valueB: V("basic", "getVariable", { name: "playerName" })
})
// Result: "Player Alice" (if variable playerName = "Alice")
```

---

### `string`

**Purpose:** Identity function - returns input unchanged

**Definition:** [basic.ts:13-17](src/events/values/basic.ts#L13-L17)
```typescript
string: value({
  run: ({ value }, {}) => {
    return value;
  },
  params: { value: "" },
}),
```

**Use cases:**
- Type conversion wrapper
- Minimal value wrapper for consistency

**Example:**
```typescript
V("basic", "string", { value: "Hello" })
// Result: "Hello"
```

---

### `getVariable`

**Purpose:** Retrieves a variable from a scoped context

**Definition:** [basic.ts:19-28](src/events/values/basic.ts#L19-L28)
```typescript
getVariable: value({
  run: ({ name, scope }, { isFast }) => {
    return getVariable(name, scope, { isFast });
  },
  params: {
    name: "",
    scope: {
      type: "value",
      group: "basic",
      name: "getMyChainId"  // Defaults to current chain ID
    } as unknown as string | undefined,
  },
}),
```

**Use cases:**
- Dynamic variable lookup with late binding
- Scoped state access within chains
- Reading shared global state

**Parameters:**
- `name` (string) - Variable name to retrieve
- `scope` (string | undefined) - Scope ID (chain ID or "global")
  - Defaults to current chain ID via nested `getMyChainId()` value

**Example:**
```typescript
// Get variable from current chain
V("basic", "getVariable", { name: "playerHealth" })

// Get variable from specific chain
V("basic", "getVariable", {
  name: "enemyCount",
  scope: "combatChain"
})

// Get global variable
V("basic", "getVariable", {
  name: "gameVersion",
  scope: "global"
})
```

---

### `getMyChainId`

**Purpose:** Returns the current chain ID

**Definition:** [basic.ts:30-34](src/events/values/basic.ts#L30-L34)
```typescript
getMyChainId: value({
  run: ({}, { parentChainId }) => parentChainId,
  params: {},
}),
```

**Use cases:**
- Scoping - get the current execution context
- Used internally by `getVariable` as default scope
- Useful for debugging or logging

**No parameters needed.**

**Example:**
```typescript
V("basic", "getMyChainId")
// Result: "chainId_12345" (or whatever the current chain ID is)
```

---

### `getEventValue` (Most Powerful!)

**Purpose:** Execute a sub-chain of events and capture the return value

**Definition:** [basic.ts:36-56](src/events/values/basic.ts#L36-L56)
```typescript
getEventValue: value({
  run: ({ events }, { parentChainId, valueId, isFast }) => {
    if (!isFast) {
      return new Promise((resolve, reject) => {
        repondEventsMeta.resolveValueMap[valueId] = resolve;
        runEvents(events, { chainId: valueId, parentChainId });
        // If the chain finishes, it will also resolve
      });
    } else {
      runEvents(events, { chainId: valueId, parentChainId, isFast });
      repondEventsMeta.fastChainMeta.getEventValueChainId = valueId;
      return repondEventsMeta.fastChain.foundFastReturnValue;
    }
  },
  params: { events: [] as EventBlock[] },
}),
```

**How it works:**

1. Creates a new chain with the provided events
2. In **non-fast mode**:
   - Returns a Promise
   - Stores a resolver function in `repondEventsMeta.resolveValueMap[valueId]`
   - When the chain calls `returnValue`, it resolves the promise
3. In **fast mode**:
   - Runs events synchronously
   - Stores result in `fastChain.foundFastReturnValue`

**Use cases:**
- **Event result chaining** - downstream events depend on upstream results
- **Computed parameters** - calculate values via events before passing to another event
- **Conditional logic** - run events to determine what value to use

**Example:**
```typescript
runEvent("game", "applyDamage", {
  amount: V("basic", "getEventValue", {
    events: [
      E("game", "calculateDamage", { attacker: "player", defender: "enemy" }),
      E("basic", "returnValue", {
        value: V("basic", "getVariable", { name: "calculatedDamage" })
      })
    ]
  })
});
```

**Flow:**
1. `applyDamage` event starts
2. `amount` parameter needs evaluation
3. `getEventValue` is called
4. Sub-chain runs:
   - `calculateDamage` event executes (sets variable "calculatedDamage")
   - `returnValue` event executes (retrieves variable and resolves promise)
5. `applyDamage` receives the calculated value as `amount`

### `returnValue` Event (Companion to `getEventValue`)

**Definition:** [src/events/basic.ts:46-69](src/events/basic.ts#L46-L69)

```typescript
returnValue: event({
  run: ({ value }, { isFirstStart, chainId, isFast }) => {
    if (!isFast) {
      return new Promise((resolve) => {
        if (isFirstStart) {
          const getEventValueChainId = resolveNearestGetEventValue(chainId, value);
          if (getEventValueChainId) {
            chainDo("cancel", getEventValueChainId);  // Clean up sub-chain
          }
        }
        resolve();
      });
    } else {
      // Fast mode
      repondEventsMeta.fastChain.foundFastReturnValue = value;
      const nearestChainId = repondEventsMeta.fastChainMeta.getEventValueChainId;
      chainDo("cancel", nearestChainId, { isFast });
    }
  },
  params: { value: undefined as any },
  isParallel: false,
}),
```

**Resolution mechanism:** [src/valueHelpers.ts:94-110](src/valueHelpers.ts#L94-L110)

```typescript
export function resolveNearestGetEventValue(initialChainId: ChainId, value: any) {
  let chainId: string | null = initialChainId;
  let didResolve = false;

  // Walk up the chain hierarchy
  while (chainId) {
    const chainState = getState("chains", chainId);
    if (chainState && chainId in repondEventsMeta.resolveValueMap) {
      repondEventsMeta.resolveValueMap[chainId]?.(value);  // Resolve the promise!
      didResolve = true;
      break;
    }
    chainId = chainState ? chainState.parentChainId : null;
  }

  return didResolve ? chainId : null;
}
```

---

## 5. Creating Custom Values

### Step 1: Define Value Types

**Use the `makeValueTypes()` factory:**

**API:** [src/helpers.ts:299-304](src/helpers.ts#L299-L304)

```typescript
export function makeValueTypes<K_ValueName extends string, T_ValuesMap extends Record<K_ValueName, ValueTypeDefinition<any>>>(
  valuesToAdd: (arg0: { value: MakeValueType }) => T_ValuesMap
) {
  return valuesToAdd({ value: makeValueType });
}
```

**Example:**

```typescript
import { makeValueTypes } from "repond-events";

const myCustomValues = makeValueTypes(({ value }) => ({
  // Simple value - multiply by 2
  double: value({
    run: ({ number }) => number * 2,
    params: { number: 0 },
  }),

  // Value with context access
  getCurrentTime: value({
    run: ({}, { parentChainId }) => {
      console.log("Running in chain:", parentChainId);
      return Date.now();
    },
    params: {},
  }),

  // Value with nested value support
  greet: value({
    run: ({ name, prefix }) => `${prefix} ${name}!`,
    params: {
      name: "",
      prefix: "Hello",  // Can be overridden with a ValueBlock
    },
  }),
}));
```

### Step 2: Register Value Types

**Use `initValueTypeGroups()`:**

**API:** [src/helpers.ts:306-338](src/helpers.ts#L306-L338)

```typescript
initValueTypeGroups({
  custom: myCustomValues,
  basic: basicValues,  // Include built-in values
});
```

**Features:**
- Automatically strips "Values" suffix from group keys (e.g., `myCustomValues` → `myCustom`)
- Sets `id` on each value type: `groupName_valueName`
- Stores in `repondEventsMeta.allValueTypeGroups`

### Step 3: Use Custom Values

```typescript
// Create value blocks
const doubledValue = V("custom", "double", { number: 5 });
const greeting = V("custom", "greet", {
  name: "Alice",
  prefix: V("basic", "getVariable", { name: "greetingPrefix" })
});

// Use in event parameters
runEvent("ui", "showMessage", {
  text: greeting  // Will evaluate to "Hello Alice!" (or custom prefix from variable)
});
```

### ValueRunInfo Context

**Type definition:** [src/types.ts:207-213](src/types.ts#L207-L213)

```typescript
export type ValueRunInfo = {
  valueId: string;           // Unique ID for this value execution
  parentChainId?: ChainId;   // Chain context for scoping
  runBy?: string;            // Who triggered this (unused currently)
  addedBy?: string;          // Who added this (unused currently)
  isFast?: boolean;          // Whether running in fast mode
};
```

**Available in value functions:**
```typescript
myValue: value({
  run: (params, valueRunInfo) => {
    console.log("Value ID:", valueRunInfo.valueId);
    console.log("Chain:", valueRunInfo.parentChainId);
    console.log("Fast mode:", valueRunInfo.isFast);
    return /* computed value */;
  },
  params: {},
}),
```

---

## 6. Use Cases - When to Use Values

### Use Case 1: Late-Binding Variable Access

**Problem:** You want event parameters to use the *current* value of a variable, not the value at definition time.

**Solution:**
```typescript
// WITHOUT Values - fixed at definition time
const health = getVariable("playerHealth");
runEvent("ui", "showHealth", { amount: health });  // Fixed value

// WITH Values - evaluated at runtime
runEvent("ui", "showHealth", {
  amount: V("basic", "getVariable", { name: "playerHealth" })
});
// Gets the LATEST value each time the event runs
```

### Use Case 2: Event Result Chaining

**Problem:** You need downstream events to use results from upstream events.

**Solution:**
```typescript
runEvents([
  // First, calculate damage
  E("combat", "calculateDamage", {
    attacker: "player",
    defender: "enemy"
  }),
  // Then, apply the calculated damage
  E("combat", "applyDamage", {
    target: "enemy",
    amount: V("basic", "getEventValue", {
      events: [
        E("basic", "returnValue", {
          value: V("basic", "getVariable", { name: "lastCalculatedDamage" })
        })
      ]
    })
  })
]);
```

**Alternative pattern (inline calculation):**
```typescript
runEvent("combat", "applyDamage", {
  target: "enemy",
  amount: V("basic", "getEventValue", {
    events: [
      E("combat", "calculateDamage", { /* params */ }),
      E("basic", "returnValue", {
        value: V("basic", "getVariable", { name: "calculatedDamage" })
      })
    ]
  })
});
```

### Use Case 3: Dynamic Composition

**Problem:** You want to build reusable event definitions that work in different contexts.

**Solution:**
```typescript
// Generic heal event - works in any chain with "healAmount" variable
const healEvent = E("combat", "heal", {
  amount: V("basic", "getVariable", {
    name: "healAmount",
    scope: V("basic", "getMyChainId")  // Uses current chain's scope
  })
});

// Use in different chains - each gets its own scoped variable
runEvents([healEvent], { chainId: "playerChain" });  // Uses playerChain's healAmount
runEvents([healEvent], { chainId: "enemyChain" });   // Uses enemyChain's healAmount
```

### Use Case 4: Complex Value Computation

**Problem:** You need to combine multiple values or perform computations.

**Solution:**
```typescript
runEvent("ui", "displayScore", {
  text: V("basic", "combine", {
    valueA: "Score: ",
    valueB: V("basic", "combine", {
      valueA: V("basic", "getVariable", { name: "currentScore" }),
      valueB: V("basic", "combine", {
        valueA: " / ",
        valueB: V("basic", "getVariable", { name: "maxScore" })
      })
    })
  })
});
// Result: "Score: 450 / 1000" (if variables are 450 and 1000)
```

### Use Case 5: Serializable Event Chains

**Problem:** You want to save/load event chains or generate them from JSON.

**Solution:**
```typescript
// This entire event chain can be serialized to JSON
const questChain = [
  E("game", "showDialog", {
    text: V("basic", "combine", {
      valueA: "Welcome, ",
      valueB: V("basic", "getVariable", { name: "playerName" })
    })
  }),
  E("basic", "wait", { duration: 2000 }),
  E("game", "giveItem", {
    item: V("basic", "getVariable", { name: "questRewardItem" })
  })
];

// Can be saved as JSON
const json = JSON.stringify(questChain);

// Can be loaded and executed later
const loadedChain = JSON.parse(json);
runEvents(loadedChain);
```

---

## 7. Integration with Events

### Any Parameter Can Accept a ValueBlock

**Evidence:** [src/valueHelpers.ts:9-23](src/valueHelpers.ts#L9-L23)

```typescript
export function evaluateValue(
  rawValue: RawValue | ValueBlock,
  valueRunInfo: ValueRunInfo,
  options: { isFast?: boolean } = {}
): RawValue | Promise<RawValue> {
  if (typeof rawValue !== "object" || rawValue === null) {
    return rawValue;  // Primitives
  }

  if (isValueBlock(rawValue)) {
    return evaluateValueBlock(rawValue, valueRunInfo);  // ValueBlocks
  }

  return rawValue;  // Plain objects
}
```

**This means:**
- Event parameters can be raw values OR ValueBlocks
- The system automatically detects and evaluates ValueBlocks
- No special syntax needed - just pass a ValueBlock where you'd normally pass a value

### Type Safety

**Reality:** TypeScript types define expected raw parameter types, but ValueBlocks can be substituted.

**From built-in values:** [src/events/values/basic.ts:25](src/events/values/basic.ts#L25)
```typescript
scope: {
  type: "value",
  group: "basic",
  name: "getMyChainId"
} as unknown as string | undefined,
```

The `as unknown as` cast allows ValueBlocks where raw types are expected.

**Practical type safety:**
- Value functions return the expected type
- TypeScript can't fully enforce ValueBlock compatibility
- Runtime evaluation ensures correct types (or coercion via `+`, etc.)

---

## 8. Advanced Patterns

### Pattern 1: Nested Value Composition

```typescript
// Build complex values from simple ones
const fullName = V("basic", "combine", {
  valueA: V("basic", "getVariable", { name: "firstName" }),
  valueB: V("basic", "combine", {
    valueA: " ",
    valueB: V("basic", "getVariable", { name: "lastName" })
  })
});

runEvent("ui", "displayName", { text: fullName });
// Result: "Alice Johnson" (if variables are "Alice" and "Johnson")
```

### Pattern 2: Conditional Logic via Events

```typescript
// Use getEventValue to run conditional logic
runEvent("game", "processAction", {
  result: V("basic", "getEventValue", {
    events: [
      E("game", "checkCondition", { /* params */ }),
      E("basic", "returnValue", {
        value: V("basic", "getVariable", { name: "conditionResult" })
      })
    ]
  })
});
```

### Pattern 3: Scoped Variable Lookup with Fallback

```typescript
// Custom value for scoped lookup with fallback
const scopedLookup = makeValueTypes(({ value }) => ({
  getWithFallback: value({
    run: ({ name, fallback }, { parentChainId, isFast }) => {
      const value = getVariable(name, parentChainId, { isFast });
      return value !== undefined ? value : fallback;
    },
    params: {
      name: "",
      fallback: "",
    },
  }),
}));

// Use it
runEvent("ui", "showMessage", {
  text: V("custom", "getWithFallback", {
    name: "customGreeting",
    fallback: "Hello!"  // Default if variable not found
  })
});
```

### Pattern 4: Dynamic Chain References

```typescript
// Get variable from a dynamically determined chain
runEvent("game", "checkAllies", {
  allyHealth: V("basic", "getVariable", {
    name: "health",
    scope: V("basic", "getVariable", {
      name: "currentAllyChainId",
      scope: "global"
    })
  })
});
```

---

## 9. Comparison: Values vs. Functions

| Aspect | Regular Functions | Values |
|--------|------------------|--------|
| **Evaluation** | Immediate | Deferred until event runtime |
| **Serialization** | Cannot serialize | Fully serializable (JSON) |
| **Composition** | Via function calls | Via nested ValueBlocks |
| **Reusability** | Requires code duplication | Single definition, multiple uses |
| **Context** | Closure capture | Explicit via ValueRunInfo |
| **Type Safety** | Full TypeScript support | Limited (runtime checks) |
| **Debugging** | Stack traces | Harder (nested evaluation) |

**When to use Values:**
- Event parameters that need late-binding
- Serializable event chains
- Dynamic composition
- Event result chaining

**When to use Functions:**
- Inside event handlers (`run` functions)
- Complex logic that doesn't need serialization
- One-off computations
- Type-critical code

---

## 10. Summary

### Key Takeaways

1. **Values are deferred computations** - evaluated at event runtime, not definition time
2. **Any parameter can be a Value** - the system automatically detects and evaluates ValueBlocks
3. **Values can be nested** - enabling complex, composable parameter definitions
4. **Values enable event chaining** - via `getEventValue` and `returnValue`
5. **Values are serializable** - can be saved/loaded as JSON
6. **5 built-in values** - combine, string, getVariable, getMyChainId, getEventValue
7. **Custom values are easy** - use `makeValueTypes()` and `initValueTypeGroups()`
8. **Values enable late-binding** - parameters resolve dynamically based on current state

### File Reference

| File | Purpose |
|------|---------|
| [src/types.ts](src/types.ts) | ValueBlock and ValueTypeDefinition types |
| [src/valueHelpers.ts](src/valueHelpers.ts) | Core evaluation logic |
| [src/events/values/basic.ts](src/events/values/basic.ts) | Built-in values |
| [src/helpers.ts](src/helpers.ts) | Value creation and registration |
| [src/internal.ts](src/internal.ts) | Event execution with param evaluation |
| [src/meta.ts](src/meta.ts) | Metadata storage (resolveValueMap) |
| [src/events/basic.ts](src/events/basic.ts) | returnValue event |

### API Quick Reference

```typescript
// Create values
const myValue = makeValue(group, name, params, options);
const myValue = V(group, name, params);  // Shorthand

// Define custom values
const myValues = makeValueTypes(({ value }) => ({
  myValue: value({ run, params }),
}));

// Register values
initValueTypeGroups({ group: myValues });

// Built-in values
V("basic", "combine", { valueA, valueB })
V("basic", "string", { value })
V("basic", "getVariable", { name, scope })
V("basic", "getMyChainId")
V("basic", "getEventValue", { events })
```
