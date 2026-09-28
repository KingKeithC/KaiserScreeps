import { object } from "lodash";
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

  // Body for creeps spawned of this role
  abstract BodyParts: BodyPartConstant[];

  // Minimum RCL needed to start using this role.
  abstract SpawnAtRCL: number;
  StopSpawnAtRCL: number = 100;

  DefaultRoleName: string = "harvester";

  // Main logic for custom role
  abstract OnTick(creep: Creep, room: Room): void;

  protected RoleBodyCost(): number {
    var total: number = 0;
    for (const part of this.BodyParts) total += BODYPART_COST[part];
    return total;
  }

  protected CreepsInRole = (room: Room) => room.find(FIND_MY_CREEPS, { filter: (creep) => creep.memory.role === this.RoleName });

  protected SpawnRequirementsMet(room: Room): boolean {
    // Skip spawn if RCL is too low
    const rcl = room.controller?.level ?? -1;
    if (rcl < this.SpawnAtRCL || rcl >= this.StopSpawnAtRCL) return true;

    // or quota met
    if (this.CreepsInRole(room).length >= this.CountPerRoom) return true;

    // or a spawn is already in progress
    if (room.find(FIND_MY_SPAWNS, { filter: (s) => s.spawning }).length) return true;

    // otherwise requirements are unmet
    return false;
  }

  SpawnIfNeeded(room: Room): void {
    if (this.SpawnRequirementsMet(room)) return;
    var msg: string = `${room} has ${this.CreepsInRole(room).length}/${this.CountPerRoom} of '${this.RoleName}', `;

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

  RefreshEmptyCreeps(room: Room): void {
    const missingRoles = room.find(FIND_MY_CREEPS, { filter: (creep) => !creep.memory.role || !creep.memory.room });
    for (const creep of missingRoles) {
      creep.memory.room = room.name;
      creep.memory.role = this.DefaultRoleName;
    }
  }

  // Run role logic for each creep in the room
  RunForRoom(room: Room): void {
    this.RefreshEmptyCreeps(room);
    this.SpawnIfNeeded(room);

    for (const creep of room.find(FIND_MY_CREEPS,
      { filter: (creep) => creep.memory.role === this.RoleName })
    ) {
      this.OnTick(creep, room);
    }
  }
}

enum HarvesterAction {
  Harvest,
  Upgrade,
  StopDowngrade,
  Build,
  Repair,
  Transfer,
}

class HarvesterMemory {
  action: HarvesterAction = HarvesterAction.Harvest;
  target: Id<ConstructionSite<BuildableStructureConstant> | AnyOwnedStructure | Source> | null = null;
}

class Harvester extends Role {
  RoleName = "harvester";

  SpawnAtRCL = 0;
  CountPerRoom = 6;
  BodyParts = [WORK, CARRY, MOVE];

  DesiredRCL = 3;
  DowngradeStopThreshold = 1000;

  OnTick(creep: Creep, room: Room): void {
    if (!creep.memory.jobMemory || this.IsDeliveryComplete(creep))
      this.Reassign(creep);
    else
      this.Act(creep);
  }

  Reassign(creep: Creep): void {
    const mem = (creep.memory.jobMemory as HarvesterMemory) = new HarvesterMemory();
    creep.say('Reassigned!')

    // Harvest if we have extra space
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
      const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
      if (source) {
        mem.target = source.id;
        mem.action = HarvesterAction.Harvest;
      } else {
        creep.say("no sources :(");
      }
      return;
    }

    // Select target in order of priority
    var targetObject;

    // Spawns low on energy
    targetObject = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
      filter: (structure) =>
        (structure.structureType === STRUCTURE_EXTENSION || structure.structureType === STRUCTURE_SPAWN)
        && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    });
    if (targetObject) {
      mem.target = targetObject.id;
      mem.action = HarvesterAction.Transfer;
      return;
    }

    // Controllers at risk of downgrade
    targetObject = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
      filter: (structure) => structure.structureType === STRUCTURE_CONTROLLER && structure.ticksToDowngrade < this.DowngradeStopThreshold
    });
    if (targetObject) {
      mem.target = targetObject.id;
      mem.action = HarvesterAction.StopDowngrade;
      return;
    }

    // Structures in need of repair
    targetObject = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
      filter: (structure) => structure.hits < structure.hitsMax
    });
    if (targetObject) {
      mem.target = targetObject.id;
      mem.action = HarvesterAction.Repair;
      return;
    }

    // Ongoing Construction
    targetObject = creep.pos.findClosestByPath(FIND_MY_CONSTRUCTION_SITES, {
      filter: (site) => site.progress < site.progressTotal,
    });
    if (targetObject) {
      mem.target = targetObject.id;
      mem.action = HarvesterAction.Build;
      return;
    }

    // Pending Upgrades
    targetObject = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
      filter: (structure) => structure.structureType === STRUCTURE_CONTROLLER && structure.level < 8
    });
    if (targetObject) {
      mem.target = targetObject.id;
      mem.action = HarvesterAction.Upgrade;
      return;
    }

    creep.say("no targets :(");
  }

  Act(creep: Creep): void {
    const m = creep.memory.jobMemory as HarvesterMemory;
    if (m.target == null || m.target == undefined) {
      creep.say("X_X");
      return;
    }
    const targetObject = Game.getObjectById(m.target);
    if (targetObject == null || targetObject == undefined) {
      creep.say("H_X");
      return;
    }

    var result: number | null = null;
    switch (m.action) {
      case (HarvesterAction.Upgrade || HarvesterAction.StopDowngrade): {
        const t = targetObject as StructureController;
        result = creep.upgradeController(t);
        if (result === OK) console.log(`${creep.name} upgraded ${t} (Downgrade in ${t.ticksToDowngrade})`);
        break;
      }
      case (HarvesterAction.Build): {
        const t = targetObject as ConstructionSite;
        result = creep.build(t);
        if (result === OK) console.log(`${creep.name} builds ${t} (${t.progress}/${t.progressTotal}) %${(t.progress / t.progressTotal * 100).toFixed(2)}`);
        break;
      }
      case (HarvesterAction.Repair): {
        const t = targetObject as AnyOwnedStructure;
        result = creep.repair(t);
        if (result === OK) console.log(`${creep.name} repaired ${t} (${t.hits}/${t.hitsMax}) %${(t.hits / t.hitsMax * 100).toFixed(2)}`);
        break;
      }
      case (HarvesterAction.Transfer): {
        const t = targetObject as AnyStoreStructure;
        result = creep.transfer(t, RESOURCE_ENERGY);
        if (result === OK) console.log(`${creep.name} supplied ${t}.`);
        break;
      }
      case (HarvesterAction.Harvest): {
        const t = targetObject as Source;
        result = creep.harvest(t)
        if (result === OK) console.log(`${creep.name} mined ${t}.`)
        break;
      }
      default:
        return;
    }

    switch (result) {
      case OK: { creep.say("OwO") }
      case ERR_NOT_IN_RANGE: creep.moveTo(targetObject, { visualizePathStyle: { fill: COLOURS.PATH_TARGET } });
      case ERR_NOT_ENOUGH_ENERGY || ERR_NOT_ENOUGH_RESOURCES: this.Reassign(creep);
    }
  }

  IsDeliveryComplete(creep: Creep): boolean {
    const m = creep.memory.jobMemory as HarvesterMemory;
    if (m.target == null || m.target == undefined) {
      creep.say("X_X");
      return true;
    }
    const targetObject = Game.getObjectById(m.target);
    if (targetObject == null || targetObject == undefined) {
      creep.say("H_X");
      return true;
    }

    switch (m.action) {
      case (HarvesterAction.Upgrade): {
        const t = targetObject as StructureController;
        return t.level >= this.DesiredRCL;
      }
      case (HarvesterAction.StopDowngrade): {
        const t = targetObject as StructureController;
        return t.ticksToDowngrade >= this.DowngradeStopThreshold
      }
      case (HarvesterAction.Build): {
        const t = targetObject as ConstructionSite;
        return t.progress === t.progressTotal;
      }
      case (HarvesterAction.Repair): {
        const t = targetObject as AnyOwnedStructure;
        return t.hits === t.hitsMax;
      }
      case (HarvesterAction.Transfer): {
        const t = targetObject as AnyStoreStructure;
        return t.store.getFreeCapacity(RESOURCE_ENERGY) === 0;
      }
      case (HarvesterAction.Harvest): {
        return creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0;
      }
      default:
        return true;
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
      role.RunForRoom(room);
    }
  }
}

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
export const loop = ErrorMapper.wrapLoop(MainLoop);
