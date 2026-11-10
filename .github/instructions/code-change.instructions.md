---
description: "Use when planning or executing code changes."
---
# Code Change Instructions

- When a build, or lint check is needed, use the corresponding VS Code workspace task.
- Prefer a build when you just need a quick check to verify there are no errors.
- Do not modify or run tests unless explicity asked.
- Objects returned by calls to `Game.getObjectById(id)`, or the contents of the `Game.rooms` and `Game.creeps` maps, and other `Game` properties are considered 'live' until the end of the main loop, and 'stale' thereafter. Stale objects must not be accessed.
- Object Ids can be persisted in global state, which should be rooted in the `Colony` class.
- Assume persisted Screeps/simulation state can be reset. Do not plan state transition/migration or backward-compatibility work unless the user explicitly asks for it.
