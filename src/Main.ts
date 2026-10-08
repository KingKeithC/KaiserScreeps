import { ErrorMapper } from "utils/ErrorMapper";
import { RoomExtra } from "Room";
import { RoomRole } from "roles/Role";
import "roles";
import profiler from "screeps-profiler";

const MainLoop = () => {
  Memory.rooms ??= {};
  Memory.creeps ??= {};

  // Get all rooms I can access
  const Rooms: RoomExtra[] = Object.values(Game.rooms).map(c => new RoomExtra(c));
  for (const m of Rooms) m.OnTick();
};


profiler.enable();
profiler.registerFN(MainLoop, "MainLoop");
profiler.registerClass(ErrorMapper, "ErrorMapper");
profiler.registerClass(RoomExtra, "RoomExtra");
profiler.registerClass(RoomRole, "RoomRole");
for (const roleType of RoomRole.Registry.values()) {
  profiler.registerClass(roleType, roleType.RoleName);
}
export const loop = profiler.wrap(ErrorMapper.wrapLoop(MainLoop));

// Commands to reset memory if it is wiped.
//
// Reset roles based on name prefix:
//      [("Worker", "WorkerI"), ("Miner", "Miner"), ("Settler", "Settler"), ("Scout", "Scout")].map((prefix, name) => Object.values(Game.creeps).filter(c => c.name.startsWith(prefix)).map(c => c.memory.role = name));
//
// Reset assigned room to current room:
//      Object.values(Game.creeps).map(c => c.memory.room = c.room.name);
// Redistribute miners:
//      Object.values(Game.creeps).filter(c => c.my && c.memory.role.startsWith("Miner")).map(m => m.memory.jobMemory = {})
