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

abstract class Role {
  abstract RoleName: string;
  abstract CountPerRoom: number;
  abstract BodyParts: BodyPartConstant[];
  abstract InitJobMemory: object;
  abstract OnTick(creep: Creep, room: Room): void;

  // Minimum RCL needed to start using this role.
  abstract SpawnAtRCL: number;
  StopSpawnAtRCL: number = 100;

  RoleBodyCost(): number {
    var total: number = 0;
    for (const part of this.BodyParts) total += BODYPART_COST[part];
    return total;
  }

  // Run role logic for each creep in the room
  RunForRoom(room: Room): void {
    for (const creep of room.find(FIND_MY_CREEPS,
      { filter: (creep) => creep.memory.role === this.RoleName })
    ) {
      this.OnTick(creep, room);
    }
  }

  CurrentSpawns = (room: Room) => room.find(FIND_MY_CREEPS, { filter: (creep) => creep.memory.role === this.RoleName });

  SpawnRequirementsMet(room: Room): boolean {
    // Skip spawn if RCL is too low
    const rcl = room.controller?.level ?? -1;
    if (rcl < this.SpawnAtRCL || rcl >= this.StopSpawnAtRCL) return true;

    // or quota met
    if (this.CurrentSpawns(room).length >= this.CountPerRoom) return true;

    // or a spawn is already in progress
    if (room.find(FIND_MY_SPAWNS, { filter: (s) => s.spawning }).length) return true;

    // otherwise requirements are unmet
    return false;
  }

  TopUpRoomCount(room: Room): void {
    if (this.SpawnRequirementsMet(room)) return;
    var msg: string = `${room} has ${this.CurrentSpawns(room).length}/${this.CountPerRoom} of '${this.RoleName}', `;

    // Find a suitable spawn point
    const spawns = room.find(FIND_MY_SPAWNS, {
      filter: (spawn) => !spawn.spawning && spawn.store.energy >= this.RoleBodyCost()
    });

    if (spawns.length === 0) {
      msg += "no spawns available."
      console.log(msg);
      return;
    }

    const spawnPoint = spawns[0];
    spawnPoint.spawnCreep(
      this.BodyParts,
      `${this.RoleName}-${Game.time}`,
      {
        memory: {
          room: room.name,
          role: this.RoleName,
          jobMemory: {},
        },
      }
    );
    console.log(msg + `spawning at ${spawnPoint}...`);
  }
}

class Harvester extends Role {
  SpawnAtRCL = 0;
  RoleName = "harvester";
  CountPerRoom = 6;
  BodyParts = [WORK, CARRY, MOVE];
  InitJobMemory: { isWorking: boolean } = { isWorking: false };

  OnTick(creep: Creep, room: Room): void {
    const jobMemory = creep.memory.jobMemory as { isWorking: boolean };

    // Switch out of 'deliver' state when delivery is complete
    if (jobMemory.isWorking && creep.store[RESOURCE_ENERGY] === 0) {
      jobMemory.isWorking = false;
      creep.say("🔄 harvest");
    }

    // Switch into delivery state when filled up
    if (!jobMemory.isWorking && creep.store.getFreeCapacity() === 0) {
      jobMemory.isWorking = true;
      creep.say("⚡ transfer");
    }

    if (jobMemory.isWorking) {
      // Spend Energy

      // Select target
      const target = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
        filter: (structure) =>
          (structure.structureType === STRUCTURE_EXTENSION || structure.structureType === STRUCTURE_SPAWN)
          && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
      }) ?? creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
        filter: (structure) => structure.structureType === STRUCTURE_CONTROLLER && structure.ticksToDowngrade < 1000
      }) ?? creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
        filter: (structure) => structure.hits < structure.hitsMax
      }) ?? creep.pos.findClosestByPath(FIND_MY_CONSTRUCTION_SITES, {
        filter: (site) => site.progress < site.progressTotal,
      });

      // Skip if no target found
      if (target === null || target === undefined) {
        creep.say("no target :(");
        return;
      }

      // Move until in range of target
      if (!creep.pos.inRangeTo(target?.pos, 1)) {
        creep.moveTo(target, { visualizePathStyle: { stroke: COLOURS.PATH_TARGET }, reusePath: 5 });
        return;
      }

      // Deliver energy
      if (target.structureType === STRUCTURE_CONTROLLER) {
        console.log(`${creep.name} is upgrading ${target} (Downgrade in ${target.ticksToDowngrade})`);
        creep.upgradeController(target);
      } else if (target instanceof ConstructionSite) {
        console.log(`${creep.name} is building ${target} (${target.progress}/${target.progressTotal}) %${(target.progress / target.progressTotal * 100).toFixed(2)}`);
        creep.build(target);
      } else if (target.hits < target.hitsMax) {
        console.log(`${creep.name} is repairing ${target} (${target.hits}/${target.hitsMax}) %${(target.hits / target.hitsMax * 100).toFixed(2)}`);
        creep.repair(target);
      } else {
        console.log(`${creep.name} is transferring to ${target}.`);
        creep.transfer(target, RESOURCE_ENERGY);
      }

    } else {
      // Collect Energy
      const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
      if (!source) {
        creep.say("no sources :(");
        return;
      }

      if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
        creep.moveTo(source, { visualizePathStyle: { stroke: COLOURS.PATH_SOURCE }, reusePath: 5 });
      }
    }
  }
}

const Roles: { [roleName: string]: Role } = {
  harvester: new Harvester(),
};

const MainLoop = () => {
  // Automatically delete memory of missing creeps
  for (const name in Memory.creeps) {
    if (!(name in Game.creeps)) {
      console.log(`Cleanup memory for ${name}`);
      delete Memory.creeps[name];
    }
  }

  // Iterate the Rooms and Roles
  for (const [roomName, room] of Object.entries(Game.rooms)) {
    for (const [roleName, role] of Object.entries(Roles)) {
      role.TopUpRoomCount(room);
      role.RunForRoom(room);
    }
  }
}

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
export const loop = ErrorMapper.wrapLoop(MainLoop);
