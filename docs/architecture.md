# Repond Events - Investigation Summary

## Overview

I've completed a comprehensive investigation of the repond-events library. Here's what I've learned and documented.

---

## Related Documentation

1. **[Getting Started Examples](getting-started.md)** - Practical examples and patterns
2. **[Values Guide](values-guide.md)** - Comprehensive guide to the Values system
3. **[Serialization Guide](serialization-guide.md)** - Deep dive into serialization capabilities
4. **[Conditional Logic](conditional-logic.md)** - Analysis of conditional logic support
5. **[JSON Events](json-events.md)** - JSON event definition capabilities

---

## Key Findings

### 1. What is Repond Events?

**An event orchestration library built on Repond** that enables:
- Complex asynchronous event chains with precise sequencing
- Sophisticated timing control (pause, resume, slow-motion, fast-forward)
- Serializable event instances for save/load and dynamic content
- Late-binding values for dynamic parameter resolution
- Scoped variables within event chains

**Primary use cases:**
- Game development (animations, quest systems, cutscenes)
- UI workflows requiring timing control
- Offline-first apps with event queues
- LLM/AI-generated content (events defined at runtime)
- Any application needing serializable, controllable event sequences

---

### 2. Serialization - FULLY SUPPORTED

✅ **What CAN be serialized:**
- Event instances (EventBlocks) - fully JSON-compatible
- Value instances (ValueBlocks) - fully JSON-compatible
- Chain state (event queues, variables, timing)
- Entire event systems can be saved/loaded

❌ **What CANNOT be serialized:**
- Event TYPE definitions (the `run` functions)
- Value TYPE definitions
- Event handlers must be pre-defined in code

**Key Pattern:**
```
Event TYPE definitions (with run functions) → Compiled code
Event INSTANCES (data only) → JSON
```

**This enables:**
- Save/load game state
- Cross-device state sync
- Offline event queues
- LLM-generated event chains
- Server-driven content updates
- Works on iOS (no runtime code compilation needed)

**See:** [Serialization Guide](serialization-guide.md)

---

### 3. Values System - THE GAME CHANGER

**Values** are deferred computations that enable late-binding parameters.

**Key insight:** Instead of passing static values to events, you pass Value objects that get evaluated *at event runtime*.

**Built-in Values:**
1. `combine` - Concatenate/add values
2. `string` - Identity function
3. `getVariable` - Retrieve scoped variable
4. `getMyChainId` - Get current chain ID
5. **`getEventValue`** - Run sub-events and capture return value (MOST POWERFUL!)

**What Values enable:**
- Dynamic parameter resolution
- Event result chaining (downstream events use upstream results)
- Scoped variable access
- Complex value composition
- Fully serializable (can be JSON)

**Example:**
```typescript
// Without Values (static)
runEvent("game", "applyDamage", { amount: 50 });

// With Values (dynamic - evaluated at runtime)
runEvent("game", "applyDamage", {
  amount: V("basic", "getVariable", { name: "calculatedDamage" })
});

// With getEventValue (event chaining)
runEvent("game", "applyDamage", {
  amount: V("basic", "getEventValue", {
    events: [
      E("game", "calculateDamage", { baseDamage: 50, multiplier: 1.5 }),
      E("basic", "returnValue", { value: V("basic", "getVariable", { name: "result" }) })
    ]
  })
});
```

**See:** [Values Guide](values-guide.md)

---

### 4. Conditional Logic - NOT DIRECTLY SUPPORTED

❌ **No built-in conditional events** (no if/else, branching, switches)

**Workarounds:**
1. Custom events with JavaScript if/else logic inside `run` functions
2. Imperative `skipToEvent()` calls from outside the event system
3. Use `getEventValue` to compute conditional results
4. Separate chains for different paths

**Why no conditionals?**
- Chains are linear arrays (not tree/graph structures)
- Event definitions are functions (not serializable conditionals)
- Skip mode is imperative, not declarative

**This is by design** - the library prioritizes:
- Sequential, timing-based execution
- Serialization
- Simplicity

**See:** [Conditional Logic](conditional-logic.md)

---

### 5. Runtime JSON Events - PARTIAL SUPPORT

✅ **Event INSTANCES from JSON - FULLY SUPPORTED:**
- EventBlocks are plain objects (JSON-compatible)
- ValueBlocks are plain objects (JSON-compatible)
- Nested values work perfectly in JSON
- Entire event chains can be loaded from JSON

❌ **Event TYPE DEFINITIONS from JSON - NOT SUPPORTED:**
- Event handlers contain `run` functions (cannot be JSON)
- Event types must be pre-defined in compiled code
- JSON can only reference existing event types

**Pattern:**
```typescript
// 1. Define event types in code (once, at startup)
const gameEvents = makeEventTypes(({ event }) => ({
  showDialog: event({ run: showDialogHandler, params: { text: "" } }),
  giveItem: event({ run: giveItemHandler, params: { item: "" } }),
}));

initEventTypeGroups({ game: gameEvents });

// 2. Load event instances from JSON (dynamic, at runtime)
const questJson = await fetch("/api/quests/tutorial").then(r => r.json());
runEvents(questJson.events);
```

**This enables:**
- LLM-generated event chains
- Server-driven content
- Dynamic quest/dialogue systems
- iOS-compatible dynamic content (no code compilation)

**See:** [JSON Events](json-events.md)

---

### 6. Custom Time Speed - MAJOR DIFFERENTIATOR

**Events are tied to Repond state paths for timing**, not `Date.now()`.

**What this enables:**
- **Slow motion** - Set time speed to 0.5x
- **Fast forward** - Set time speed to 2x
- **Pause** - Set time speed to 0
- **Independent time streams** - Game time vs. UI time

**Example:**
```typescript
// Initialize with custom time path
initEventTypeGroups(allEvents, {
  defaultTimePath: ["global", "time", "elapsed"]
});

// Update elapsed time based on speed multiplier
const speed = 0.5;  // Slow motion
const delta = Date.now() - lastUpdate;
const scaledDelta = delta * speed;
setState("global.time.elapsed", elapsed + scaledDelta);

// All events now run at 0.5x speed!
```

**This is critical for:**
- Games with slow-motion mechanics
- Pause menus
- Multiple time streams (game world vs. UI)
- Time-travel mechanics

**See:** [Getting Started Examples - Example 5](getting-started.md#example-5-custom-time-speed-slow-motion--fast-forward)

---

## Architecture Highlights

### Clean Separation of Concerns

```
┌──────────────────────────────┐
│  Event TYPE Definitions      │  ← Code (functions, logic)
│  (run functions)             │  ← Pre-defined palette
└──────────────────────────────┘

┌──────────────────────────────┐
│  Event INSTANCES             │  ← Data (JSON-compatible)
│  (EventBlocks, ValueBlocks)  │  ← Runtime, dynamic
└──────────────────────────────┘
```

### Integration with Repond

- Uses Repond stores for state (`liveEvents`, `chains`)
- Uses Repond effects for automation (lifecycle management)
- Uses Repond state paths for timing
- Builds on Repond's reactive system

### Data Flow

```
1. runEvent() called
2. EventBlock created (plain object)
3. Added to chain (Repond state)
4. Repond effects trigger
5. Event activated (based on chain logic)
6. Parameters evaluated (Values resolved)
7. Event handler runs
8. Event completes/ends
9. Next event auto-starts
10. Chain auto-removes when empty
```

---

## Unique Selling Points

### 1. Serializable Event Chains
Unlike most event systems, repond-events event chains are **fully serializable**:
- Save/load entire event systems
- Generate events from LLM/AI
- Load events from server at runtime
- Cross-device state sync

### 2. Custom Time Sources
Events aren't tied to wall-clock time:
- Slow motion / fast forward
- Pause / resume
- Independent time streams
- Perfect for games

### 3. Late-Binding Values
Parameters are evaluated at runtime, not definition time:
- Dynamic, composable parameters
- Event result chaining
- Scoped variable access
- Fully serializable

### 4. Event Result Chaining
Downstream events can use upstream results:
- `getEventValue` runs sub-events and captures return value
- No manual state passing
- Declarative dependencies
- Clean composition

### 5. iOS/Platform Compatible
Works on platforms that don't allow runtime code compilation:
- Event types are pre-defined (compiled)
- Event instances are data (JSON)
- Perfect for mobile apps
- LLM-generated content works

---

## Comparisons

### vs. setTimeout/setInterval
| Feature | setTimeout | repond-events |
|---------|-----------|---------------|
| Serializable | ❌ No | ✅ Yes |
| Pause/resume | ❌ No | ✅ Yes |
| Custom time | ❌ No | ✅ Yes |
| Event chaining | ⚠️ Manual | ✅ Declarative |

### vs. State Machines (XState)
| Feature | XState | repond-events |
|---------|--------|---------------|
| Conditional branching | ✅ Yes | ❌ No |
| Serializable | ⚠️ Partial | ✅ Yes |
| Timing control | ⚠️ Limited | ✅ Full |
| Custom time | ❌ No | ✅ Yes |

### vs. Animation Libraries (GSAP)
| Feature | GSAP | repond-events |
|---------|------|---------------|
| Timing control | ✅ Yes | ✅ Yes |
| Serializable | ❌ No | ✅ Yes |
| Pause/resume | ✅ Yes | ✅ Yes |
| Custom events | ⚠️ Limited | ✅ Unlimited |
| LLM generation | ❌ No | ✅ Yes |

---

## Recommendations for README/Documentation

### Target Audience
Primary: **Game developers** (but emphasize broader applicability)

Secondary:
- UI developers (workflows, wizards)
- Offline-first app developers
- Anyone needing serializable event systems

### Key Messages

1. **Serializable Event Orchestration**
   - "Run complex event chains that can be saved, loaded, and generated dynamically"

2. **Custom Time Control**
   - "Pause, slow-motion, fast-forward - events tied to your time source, not the clock"

3. **Late-Binding Values**
   - "Parameters evaluated at runtime, enabling dynamic composition and event chaining"

4. **LLM/AI Ready**
   - "Generate event chains from AI, load from servers, no code compilation needed"

5. **Built on Repond**
   - "Leverages Repond's reactive state management for powerful automation"

### Getting Started Example

I recommend starting with **Example 2 from [Getting Started Examples](getting-started.md)**:
- Shows basic event chain (log + wait)
- Introduces Values (the key differentiator)
- Demonstrates late-binding
- Simple enough to understand quickly

Then show:
- Custom time speed (unique feature)
- JSON loading (LLM use case)
- Event chaining with getEventValue (powerful pattern)

### Comparisons to Highlight

1. **vs. setTimeout**: Serializable, pausable, custom time
2. **vs. State Machines**: Sequential (not conditional), but serializable
3. **vs. Animation Libraries**: More general-purpose, serializable

---

## Questions Answered

### Can event chains be serialized?
**YES** - Event instances (EventBlocks, ValueBlocks, chain state) are fully JSON-serializable. Event TYPE definitions (with `run` functions) must be pre-defined in code.

### How do Values work?
**Late-binding** - Values are deferred computations evaluated when events run, not when defined. This enables dynamic parameters, event chaining, and scoped variable access.

### Are conditionals supported?
**NO** - No built-in conditional events or branching. Workarounds exist (custom events with JS logic, imperative skip calls), but the library is designed for sequential execution.

### Can events be loaded from JSON?
**YES** - Event instances can be fully defined in JSON. Event type definitions must be pre-defined in code. This enables LLM-generated content and server-driven events.

### How does custom time speed work?
Events track elapsed time via Repond state paths (not `Date.now()`). By updating this state with a time multiplier, you can slow down, speed up, or pause all events.

---

## Next Steps

### For Documentation

1. **Update README.md** with:
   - Clear value proposition
   - Key differentiators (serialization, custom time, Values)
   - Getting started example (with Values!)
   - Use cases (games, LLM, offline-first)
   - Comparison to alternatives

2. **Update CLAUDE.md** with:
   - Architecture overview
   - Key concepts (Events, Chains, Values)
   - Integration with Repond
   - Common patterns

3. **Consider adding:**
   - Migration guide (if coming from other systems)
   - API reference
   - Advanced patterns document
   - Troubleshooting guide

### For Library Development

Consider adding:
1. **JSON validation utilities** - Helper to validate event chain JSON
2. **Serialization helpers** - `saveChainState()`, `loadChainState()`
3. **TypeScript types for JSON** - Make JSON schemas type-safe
4. **Error messages** - Better feedback when event types not found
5. **Conditional values** - `V("core", "ifThen", { condition, then, else })`

---

## Conclusion

**repond-events is a unique, powerful library** that fills a gap in the ecosystem:

**It's the only library that combines:**
- Serializable event chains (save/load, LLM-generation)
- Custom time sources (slow-motion, pause, independent streams)
- Late-binding values (dynamic composition, event chaining)
- Repond integration (reactive state management)

**It excels at:**
- Game development (timing-based events, cutscenes, quests)
- Dynamic content (LLM-generated, server-driven)
- Offline-first apps (event queues, sync)
- Anywhere serializable, controllable event sequences are needed

**Its limitations are by design:**
- No conditional branching (keeps it simple, serializable)
- Event handlers must be pre-defined (platform compatibility)
- Sequential execution focus (not for complex state machines)

**Overall:** A well-architected, focused library that solves real problems in a unique way.
