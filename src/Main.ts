import { ErrorMapper } from "utils/ErrorMapper";
import { CreepExtra } from "Creep";
import { RoomExtra } from "Room";
import "roles";

const MainLoop = () => {
  Memory.rooms ??= {};
  Memory.creeps ??= {};

  // Get all rooms I can access
  const Rooms: RoomExtra[] = Object.values(Game.rooms).map(c => new RoomExtra(c));
  for (const m of Rooms) m.OnTick();
};

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
export const loop = ErrorMapper.wrapLoop(MainLoop);

// Commands to reset memory if it is wiped.
//
// Reset roles based on name prefix:
//      [("Worker", "WorkerI"), ("Miner", "Miner"), ("Settler", "Settler"), ("Scout", "Scout")].map((prefix, name) => Object.values(Game.creeps).filter(c => c.name.startsWith(prefix)).map(c => c.memory.role = name));
//
// Reset assigned room to current room:
//      Object.values(Game.creeps).map(c => c.memory.room = c.room.name);
// Redistribute miners:
//      Object.values(Game.creeps).filter(c => c.my && c.memory.role.startsWith("Miner")).map(m => m.memory.jobMemory = {})
