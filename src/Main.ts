import { Colony } from 'Colony';

export const loop = new Colony().GetMainLoop();

// Commands to reset memory if it is wiped.
//
// Reset roles based on name prefix:
//      [("Worker", "WorkerI"), ("Miner", "Miner"), ("Settler", "Settler"), ("Scout", "Scout")].map((prefix, name) => Object.values(Game.creeps).filter(c => c.name.startsWith(prefix)).map(c => c.memory.role = name));
//
// Reset assigned room to current room:
//      Object.values(Game.creeps).map(c => c.memory.room = c.room.name);
// Redistribute miners:
//      Object.values(Game.creeps).filter(c => c.my && c.memory.role.startsWith("Miner")).map(m => m.memory.jobMemory = {})
