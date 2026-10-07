import { ErrorMapper } from "utils/ErrorMapper";
import { CreepExtra } from "Creep";
import { RoomExtra } from "Room";
import "roles";

const MainLoop = () => {
  Memory.rooms ??= {};
  Memory.creeps ??= {};

  // Get all my creeps, and convert them to `CreepExtra`
  const MyCreeps: CreepExtra[] = Object.values(Game.creeps).map(c => new CreepExtra(c.id));

  // Group my creeps by room they are in
  const MyCreepsByRoom: Map<string, CreepExtra[]> = new Map();
  for (const c of MyCreeps) MyCreepsByRoom.set(c.memory.room, [...MyCreepsByRoom.get(c.memory.room) ?? [], c]);

  // Instantiate a RoomManager for, and tick each room.
  const Rooms: RoomExtra[] = [];
  for (const [room, myCreepsInRoom] of MyCreepsByRoom.entries()) Rooms.push(new RoomExtra(new Room(room), myCreepsInRoom));

  // Since the managers above are based on spawned creeps,
  // it can miss rooms we have access to after respawning
  if (Rooms.length === 0) {
    // Add a manager for all rooms we can access
    for (const room of Object.values(Game.rooms)) {
      Rooms.push(new RoomExtra(room, []))
    }
  }

  for (const m of Rooms) m.TickRoom(Rooms);
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
