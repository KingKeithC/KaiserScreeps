import { ErrorMapper } from "utils/ErrorMapper";

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
    working: boolean;
  }

}
// Syntax for adding properties to `global` (ex "global.log")
declare const global: {
  log: any;
}

interface Role {
  CountPerRoom: number;
  BodyParts: BodyPartConstant[];
  OnTick: (creep: Creep) => void;
}

const Roles: { [key: string]: Role } = {
  "harvester": {
    CountPerRoom: 2,
    BodyParts: [WORK, CARRY, MOVE],
    OnTick: (creep: Creep) => {
      if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
        creep.memory.working = false;
        creep.say("🔄 harvest");
      }
      if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
        creep.memory.working = true;
        creep.say("⚡ transfer");
      }

      if (creep.memory.working) {
        const target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
          filter: (structure) => {
            return (
              (structure.structureType === STRUCTURE_EXTENSION ||
                structure.structureType === STRUCTURE_SPAWN ||
                structure.structureType === STRUCTURE_TOWER) &&
              structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            );
          },
        });
        if (target) {
          if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            creep.moveTo(target, { visualizePathStyle: { stroke: "#ffffff" } });
          }
        }
      } else {
        const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
        if (source) {
          if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
            creep.moveTo(source, { visualizePathStyle: { stroke: "#ffaa00" } });
          }
        }
      }
    },
  },
};

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
export const loop = ErrorMapper.wrapLoop(() => {
  console.log(`Current game tick is ${Game.time}`);

  // Automatically delete memory of missing creeps
  for (const name in Memory.creeps) {
    if (!(name in Game.creeps)) {
      delete Memory.creeps[name];
    }
  }

  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];

    const spawns = room.find(FIND_MY_SPAWNS);
    if (spawns.length == 0) {
      continue;
    }
    const mainSpawn = spawns[0];

    // Spawn logic
    const harvesters = room.find(FIND_MY_CREEPS, {
      filter: (creep) => creep.memory.role === "harvester",
    });
    if (harvesters.length < Roles.harvester.CountPerRoom && !mainSpawn.spawning && mainSpawn.store.getUsedCapacity(RESOURCE_ENERGY) >= 200) {
      const newName = `Harvester${Game.time}`;
      mainSpawn.spawnCreep(Roles.harvester.BodyParts, newName, {
        memory: { role: "harvester", working: false, room: room.name },
      });
      console.log(`Spawning new harvester: ${newName}`);
    }

    for (const creep of room.find(FIND_MY_CREEPS)) {
      // Update the creep's room name
      creep.memory.room = room.name;

      // Perform role logic
      const role = Roles[creep.memory.role];
      if (role) {
        role.OnTick(creep);
      } else if (creep.memory.role === undefined) {
        creep.memory.role = "harvester";
      } else {
        console.log(`Unknown role: ${creep.memory.role}`);
      }
    }
  }
});
