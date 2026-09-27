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
    jobMemory: object;
  }

}
// Syntax for adding properties to `global` (ex "global.log")
declare const global: {
  log: any;
}

const COLOURS = {
  PATH_SOURCE: "#ffaa00",
  PATH_TARGET: "#ffffff",
}

interface Role {
  RoleName: string;
  CountPerRoom: number;
  BodyParts: BodyPartConstant[];
  InitJobMemory: object;
  OnTick: (creep: Creep, room: Room) => void;
}

class Harvester implements Role {
  RoleName = "harvester";
  CountPerRoom = 3;
  BodyParts = [WORK, CARRY, MOVE];
  InitJobMemory: { isWorking: boolean } = { isWorking: false };

  OnTick(creep: Creep, room: Room): void {
    const jobMemory = creep.memory.jobMemory as { isWorking: boolean };

    if (jobMemory.isWorking && creep.store[RESOURCE_ENERGY] === 0) {
      jobMemory.isWorking = false;
      creep.say("🔄 harvest");
    }
    if (!jobMemory.isWorking && creep.store.getFreeCapacity() === 0) {
      jobMemory.isWorking = true;
      creep.say("⚡ transfer");
    }

    if (jobMemory.isWorking) {
      const target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
        filter: (structure) => {
          return (
            ((structure.structureType === STRUCTURE_EXTENSION ||
              structure.structureType === STRUCTURE_SPAWN ||
              structure.structureType === STRUCTURE_TOWER) &&
              structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0) ||
            structure.structureType === STRUCTURE_CONTROLLER
          );
        },
      });
      if (target && target.structureType !== STRUCTURE_CONTROLLER) {
        if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          creep.moveTo(target, { visualizePathStyle: { stroke: COLOURS.PATH_TARGET } });
        }
      } else if (target && target.structureType === STRUCTURE_CONTROLLER) {
        if (creep.upgradeController(target) === ERR_NOT_IN_RANGE) {
          creep.moveTo(target, { visualizePathStyle: { stroke: COLOURS.PATH_TARGET } });
        }
      }
    } else {
      const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
      if (source) {
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
          creep.moveTo(source, { visualizePathStyle: { stroke: COLOURS.PATH_SOURCE } });
        }
      }
    }
  }
}

const Roles: { [roleName: string]: Role } = {
  harvester: new Harvester(),
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

  for (const [roomName, room] of Object.entries(Game.rooms)) {
    const spawns = room.find(FIND_MY_SPAWNS);
    if (spawns.length === 0) continue; // Skip rooms without spawns
    const mainSpawn = spawns[0];

    // Check if we need to spawn more creeps for each role in the room
    for (const [roleName, role] of Object.entries(Roles)) {
      const creeps = room.find(FIND_MY_CREEPS, {
        filter: (creep) => creep.memory.role === roleName,
      });
      if (creeps.length < role.CountPerRoom) {
        console.log(`Room ${roomName} has ${creeps.length} ${roleName}s, needs ${role.CountPerRoom}`);

        if (creeps.length < role.CountPerRoom && !mainSpawn.spawning && mainSpawn.store.getUsedCapacity(RESOURCE_ENERGY) >= 200) {
          const newName = `${roleName}${Game.time}`;
          mainSpawn.spawnCreep(role.BodyParts, newName, {
            memory: { role: roleName, jobMemory: role.InitJobMemory, room: room.name },
          });
          console.log(`Spawning new ${roleName}: ${newName}`);
        }
      }
    }

    // Run role logic for each creep in the room
    for (const creep of room.find(FIND_MY_CREEPS)) {
      // Perform role logic
      const role = Roles[creep.memory.role];
      if (role) {
        role.OnTick(creep, room);
      } else if (creep.memory.role === undefined) {
        creep.memory.role = "harvester";
      } else {
        console.log(`Unknown role: ${creep.memory.role}`);
      }
    }
  }
});
