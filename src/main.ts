import { ErrorMapper } from "utils/ErrorMapper";
import { RoomManager } from "roomManager";

declare global {
  /*
    Example types, expand on these or remove them and add your own.
    Note: Values, properties defined here do no fully *exist* by this type definition alone.
          You must also give them an implementation if you would like to use them. (ex. actually setting a `role` property in a Creeps memory)

    Types added in this `global` block are in an ambient, global context. This is needed because `main.ts` is a module file (uses import or export).
    Interfaces matching on name from @types/screeps will be merged. This is how you can extend the 'built-in' interfaces from @types/screeps.
  */
  // Memory extension samples
  interface Memory {
    uuid: number;
    log: any;
  }

  interface CreepMemory {
    role: string;
    room: string;
    jobMemory: object;
    stuckTicks: number;
    lastPos: { x: number, y: number };
    moveMode?: "long" | "avoidCreeps";
    successfulAvoidMoves?: number;
  }

  interface RoomMemory {
    lastSpawnTick: { [roleName: string]: number }
    attackHostiles: boolean,
    towerAttackRange: number,
  }

}
// Syntax for adding properties to `global` (ex "global.log")
declare const global: {
  log: any;
}

const MainLoop = () => {
  for (const room of Object.values(Game.rooms)) {
    const manager = new RoomManager(room);
    manager.TickRoom();
  }
}

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
export const loop = ErrorMapper.wrapLoop(MainLoop);

// Commands to reset memory if it is wiped:
// Object.values(Game.creeps).filter(c => c.name.startsWith("Worker")).map(c => c.memory.role = "WorkerI");
// Object.values(Game.creeps).filter(c => c.name.startsWith("Miner")).map(c => c.memory.role = "Miner");
// Object.values(Game.creeps).filter(c => c.name.startsWith("Settler")).map(c => c.memory.role = "Settler");
// Object.values(Game.creeps).map(c => c.memory.room = c.room.name);
// Game.rooms["E41S43"].memory.lastSpawnTick.Settler += 10
// Game.rooms["E41S43"].memory.lastSpawnTick.Miner += 20
// Game.rooms["E41S43"].memory.lastSpawnTick.WorkerI += 30
// Game.rooms["E41S43"].memory.lastSpawnTick.WorkerII += 40
