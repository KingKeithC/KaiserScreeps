import { ErrorMapper } from "utils/ErrorMapper";
import { RoomExtra } from "Room";
import "roles";
import "Creep";

const MainLoop = () => {
  Memory.rooms ??= {};
  Memory.creeps ??= {};

  const VisibleRooms: RoomExtra[] = Object.values(Game.rooms).map(r => new RoomExtra(r.name));
  for (const r of VisibleRooms) r.TickRoom();
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
