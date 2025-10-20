# Repond

**High-performance, entity-optimized state management with declarative reactive effects**

Respond fast to item states - built for real-time applications with hundreds or thousands of entities.

[![npm version](https://img.shields.io/npm/v/repond.svg)](https://www.npmjs.com/package/repond)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Why Repond?

Repond solves a specific problem: **managing state for entity-heavy applications** where you need:

- **Real-time performance** without Redux's spread overhead
- **Built-in entity handling** without custom Zustand patterns
- **Declarative effects** that automatically respond to state changes
- **O(1) performance** regardless of item count (only processes what changed)
- **Type-safe state access** without importing stores

**Perfect for:**

- Drag & drop systems with animated positions
- 3D games with characters, items, and levels
- Real-time dashboards with many entities
- Event-driven architectures

---

## Quick Start

### Installation

```bash
npm install repond
```

### Basic Example

```typescript
import { initRepond, addItem, setState, getState, makeEffects, initEffectGroups, startEffectsGroup } from "repond";

// 1. Define your store
const playerStore = {
  newState: () => ({
    position: { x: 0, y: 0 },
    health: 100,
    name: "" as string,
  }),
  newRefs: () => ({}),
};

// 2. Initialize Repond
initRepond(
  { player: playerStore },
  ["default"] // Step names - "default" is used when no step is specified in effects
);

// 3. Create declarative effects
const gameEffects = makeEffects((makeEffect) => ({
  logPosition: makeEffect(
    (playerId) => {
      const player = getState("player", playerId);
      console.log(`Player ${playerId} moved to`, player.position);
    },
    { changes: ["player.position"] }
  ),
}));

initEffectGroups({ gameEffects });
startEffectsGroup("gameEffects");

// 4. Use it!
addItem("player", "player1");
setState("player", { position: { x: 10, y: 20 } }, "player1");
// Console: "Player player1 moved to { x: 10, y: 20 }"
```

### React Integration

```tsx
import { useStore } from "repond";

function PlayerComponent({ playerId }) {
  // Re-renders when health or position changes
  const player = useStore("player", playerId, ["health", "position"]);

  return (
    <div>
      <p>Health: {player.health}</p>
      <p>
        Position: {player.position.x}, {player.position.y}
      </p>
    </div>
  );
}
```

---

## Core Concepts

### 1. State Structure

State is organized as **ItemTypes → Items → Properties**:

```typescript
ItemType "player"
  ├── Item "player1"
  │   ├── health: 100
  │   ├── position: { x: 10, y: 20 }
  │   └── name: "Hero"
  └── Item "player2"
      ├── health: 85
      └── ...
```

### 2. State vs Refs

| **State**                      | **Refs**                                  |
| ------------------------------ | ----------------------------------------- |
| Serializable (JSON)            | Non-serializable                          |
| Persists across sessions       | Temporary, session-only                   |
| Game data, positions, settings | DOM elements, Three.js objects, callbacks |

**Example:**

```typescript
const enemyStore = {
  newState: () => ({
    health: 100,
    position: { x: 0, y: 0 },
  }),
  newRefs: () => ({
    mesh: null as THREE.Mesh | null, // 3D model reference
  }),
};
```

### 3. Effects: Three Approaches

#### Declarative Effects (Recommended)

Static effects defined upfront, can be started/stopped as groups:

```typescript
const gameEffects = makeEffects((makeEffect) => ({
  handleDeath: makeEffect(
    (playerId) => {
      const player = getState("player", playerId);
      if (player.health <= 0) {
        console.log("Game over!");
        removeItem("player", playerId);
      }
    },
    { changes: ["player.health"] }
  ),
}));

initEffectGroups({ gameEffects });
startEffectsGroup("gameEffects");
```

#### Imperative Effects (Runtime-Decided)

Temporary effects created at runtime:

```typescript
startNewEffect({
  id: "temporaryListener",
  changes: ["enemy.position"],
  run: (enemyId) => {
    const enemy = getState("enemy", enemyId);
    updateEnemySprite(enemyId, enemy.position);
  },
});

// Later: stopEffect("temporaryListener");
```

#### React Effects

Effects tied to component lifecycle:

```typescript
function GameManager() {
  useStoreEffect({
    changes: ["player.score"],
    run: (playerId) => {
      const score = getState("player", playerId).score;
      if (score > 1000) {
        showVictoryScreen();
      }
    },
  });

  return <div>Game Running</div>;
}
```

### 4. The Step System

Control the **order** effects execute:

```typescript
"physics" → "gameLogic" → "rendering"
```

**Two phases per step:**

- `duringStep`: Loops until no changes (max 8 iterations)
- `endOfStep`: Runs once after duringStep

**Example:**

```typescript
makeEffect(applyPhysics, {
  changes: ["player.velocity"],
  step: "physics",
  atStepEnd: false,
});

makeEffect(renderScene, {
  changes: ["player.position"],
  step: "rendering",
  atStepEnd: true,
});
```

---

## API Reference

### State Management

```typescript
// Add item
addItem("player", "player1");

// Set state (batched automatically)
setState("player", { health: 90 }, "player1");

// Get state
const player = getState("player", "player1");

// Get previous state (before last update)
const prevHealth = getPrevState("player", "player1").health;

// Remove item
removeItem("player", "player1");

// Get refs (non-serializable data)
const mesh = getRefs("enemy", "enemy1").mesh;
```

### Effects

```typescript
// Declarative effects
const effects = makeEffects((makeEffect) => ({
  effectName: makeEffect(runFunction, { changes: ["itemType.prop"] }),
}));

initEffectGroups({ groupName: effects });
startEffectsGroup("groupName");
stopEffectsGroup("groupName");

// Imperative effects
startNewEffect({
  id: "myEffect",
  changes: ["itemType.prop"],
  run: (itemId, diffInfo, frameDuration) => {
    /* ... */
  },
});

stopEffect("myEffect");
```

### React Hooks

```typescript
// Get reactive state (re-renders on change)
const player = useStore("player", playerId, ["health", "position"]);

// Get entire item state
const enemy = useStoreItem("enemy", enemyId);

// Effect tied to component lifecycle
useStoreEffect({
  changes: ["player.score"],
  run: (playerId) => {
    /* ... */
  },
});
```

---

## TypeScript Setup

Extend `CustomRepondTypes` for full type safety:

```typescript
// stores/index.ts
export const playerStore = {
  newState: () => ({
    position: { x: 0, y: 0 },
    health: 100,
  }),
  newRefs: () => ({}),
};

// types.ts
declare module "repond/declarations" {
  interface CustomRepondTypes {
    ItemTypeDefs: {
      player: typeof playerStore;
      enemy: typeof enemyStore;
    };
    StepNames: ["default", "physics", "gameLogic", "rendering"];
  }
}
```

Now get **full autocomplete** for typed strings:

```typescript
setState("player", { health: 100 }); // "player" autocompleted
getState("player").health; // .health autocompleted
```

---

## Performance

### Key Characteristics

- **O(1) complexity**: Performance independent of total item count
- **Selective processing**: Only processes items that changed
- **Automatic batching**: All setState calls batched per frame
- **Scale**: Handles 1,000s to 10,000s+ items efficiently

**Example**: In a game with 10,000 entities, if only 5 move per frame, Repond only processes those 5.

### Benchmarks

| Items  | Updates/Frame | Performance |
| ------ | ------------- | ----------- |
| 100    | 10            | ~0.1ms      |
| 1,000  | 50            | ~0.5ms      |
| 10,000 | 100           | ~1ms        |

_Actual performance depends on effect complexity_

---

## Advanced Patterns

### Event-Driven Architecture

Generic event systems work seamlessly with Repond's declarative effects:

```typescript
// Event handler only sets state (no app-specific logic)
eventBus.on("player.damaged", (playerId, damage) => {
  const currentHealth = getState("player", playerId).health;
  setState("player", { health: currentHealth - damage }, playerId);
});

// Effects handle side effects automatically
makeEffect(
  (playerId) => {
    if (getState("player", playerId).health <= 0) {
      triggerDeathAnimation(playerId);
      removeItem("player", playerId);
    }
  },
  { changes: ["player.health"] }
);
```

**Benefits:**

- Event system doesn't need app-specific knowledge
- Same effects run regardless of how state changes
- Easy to integrate with external event systems

### Avoiding Synchronous Reads

setState is batched, so use local variables:

```typescript
// ❌ Bad: getState won't reflect setState immediately
setState("player", { score: 100 });
console.log(getState("player").score); // May not be 100 yet

// ✅ Good: Use local variable
const newScore = 100;
setState("player", { score: newScore });
console.log(newScore); // Definitely 100
```

Or wait for next frame via effects:

```typescript
setState("player", { score: 100 });

makeEffect(
  () => {
    console.log(getState("player").score); // Now updated
  },
  { changes: ["player.score"] }
);
```

### Parameterized Effects

Create effects that vary based on parameters:

```typescript
const childEffects = makeParamEffects({ parentId: "", childId: "" }, (makeEffect, params) => ({
  syncPosition: makeEffect(
    () => {
      const parentPos = getState("parent", params.parentId).position;
      setState("child", { position: parentPos }, params.childId);
    },
    { changes: [`parent.${params.parentId}.position`] }
  ),
}));

// Start with specific parameters
startParamEffect("childEffects", "syncPosition", {
  parentId: "parent1",
  childId: "child1",
});
```

---

## Common Gotchas

### 1. Effect Infinite Loops

Don't modify the same state you're watching:

```typescript
// ❌ Infinite loop
makeEffect(
  (id) => {
    setState("player", { x: getState("player", id).x + 1 }, id);
  },
  { changes: ["player.x"] }
);
```

**Solution**: Watch different properties or add guards.

### 2. Type Inference

Use `as` for proper TypeScript inference:

```typescript
// ✅ Good
newState: () => ({
  name: "" as string,
  count: 0 as number,
});

// ❌ Bad: Types inferred as literals
newState: () => ({
  name: "", // Type: ""
  count: 0, // Type: 0
});
```

---

## Comparison to Other Libraries

| Feature                       | Repond   | Redux      | Zustand  | MobX      |
| ----------------------------- | -------- | ---------- | -------- | --------- |
| **Entity optimization**       | Built-in | Manual     | Manual   | Manual    |
| **Performance (1000+ items)** | O(1)     | O(n)       | O(n)     | O(n)      |
| **Declarative effects**       | Yes      | Middleware | Manual   | Reactions |
| **Type-safe string access**   | Yes      | No         | No       | No        |
| **Framework agnostic**        | Yes      | Yes        | Yes      | Yes       |
| **React hooks**               | Included | External   | Built-in | Built-in  |
| **Serializable state**        | Required | Yes        | Yes      | No        |
| **Learning curve**            | Medium   | High       | Low      | Medium    |

---

## Examples

### Drag & Drop System

```typescript
const draggableStore = {
  newState: () => ({
    position: { x: 0, y: 0 },
    targetPosition: { x: 0, y: 0 },
    isDragging: false,
  }),
  newRefs: () => ({
    element: null as HTMLElement | null,
  }),
};

// Animate toward target
const animationEffects = makeEffects((makeEffect) => ({
  smoothMove: makeEffect(
    (itemId) => {
      const state = getState("draggable", itemId);
      const newPos = {
        x: lerp(state.position.x, state.targetPosition.x, 0.1),
        y: lerp(state.position.y, state.targetPosition.y, 0.1),
      };
      setState("draggable", { position: newPos }, itemId);
    },
    { changes: ["draggable.targetPosition"], step: "animation" }
  ),
}));
```

### 3D Game Entities

```typescript
const characterStore = {
  newState: () => ({
    position: { x: 0, y: 0, z: 0 },
    health: 100,
    isAlive: true,
  }),
  newRefs: () => ({
    mesh: null as THREE.Mesh | null,
  }),
};

// Update 3D mesh when position changes
const renderEffects = makeEffects((makeEffect) => ({
  updateMesh: makeEffect(
    (charId) => {
      const char = getState("character", charId);
      const mesh = getRefs("character", charId).mesh;
      if (mesh) {
        mesh.position.set(char.position.x, char.position.y, char.position.z);
      }
    },
    { changes: ["character.position"], step: "rendering", atStepEnd: true }
  ),
}));
```

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## Documentation

- [CLAUDE.md](CLAUDE.md) - AI agent context and comprehensive reference
- [DOCUMENTATION_CLARIFICATIONS.md](DOCUMENTATION_CLARIFICATIONS.md) - Design decisions and clarifications

---

## License

MIT © [Your Name]

---

## Acknowledgments

Built for real-time applications where performance matters and entity management is key.

Special thanks to the React, TypeScript, and state management communities for inspiration.
