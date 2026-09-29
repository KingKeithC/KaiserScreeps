import { ErrorMapper } from "utils/ErrorMapper";
import { Harvester, HarvesterT2 } from "harvester";

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
  }

  interface RoomMemory {
    countPreventingDowngrade: number
    countPerformingUpgrade: number
    lastSpawnTick: { [roleName: string]: number }
  }

}
// Syntax for adding properties to `global` (ex "global.log")
declare const global: {
  log: any;
}

const MainLoop = () => {
  // Automatically delete memory of missing creeps
  for (const name in Memory.creeps) {
    if (!(name in Game.creeps)) {
      console.log(`Cleanup memory for ${name}`);
      delete Memory.creeps[name];
    }
  }

  for (const room of Object.values(Game.rooms)) {

    // Init Room Memory
    if (room.memory.countPreventingDowngrade == null || room.memory.countPreventingDowngrade == undefined || room.memory.countPreventingDowngrade < 0)
      room.memory.countPreventingDowngrade = 0;
    if (room.memory.countPerformingUpgrade == null || room.memory.countPerformingUpgrade == undefined || room.memory.countPerformingUpgrade < 0)
      room.memory.countPerformingUpgrade = 0;
    if (room.memory.lastSpawnTick == null || room.memory.lastSpawnTick == undefined)
      room.memory.lastSpawnTick = {};

    // Run each role in the room
    for (const role of [
      new Harvester(room),
      new HarvesterT2(room)
    ]) {
      role.DoSpawns();
      role.Tick();
    }
  }
}

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
export const loop = ErrorMapper.wrapLoop(MainLoop);
