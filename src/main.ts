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

  // How many creeps to have per room in this role
  abstract CountPerRoom: number;

  // Body for creeps spawned of this role
  abstract BodyParts: BodyPartConstant[];

  // RCL Ranges to constrain role
  SpawnAtRCL: number = 0;
  StopSpawnAtRCL: number = 100;

  // How ofter to check for spawn
  SpawnRate: number = 20;

  DefaultRoleName: string = "harvester";

  // Main logic for custom role
  abstract OnTick(creep: Creep, room: Room): void;

  protected RoleBodyCost(): number {
    var total: number = 0;
    for (const part of this.BodyParts) total += BODYPART_COST[part];
    return total;
  }

  protected CreepsInRole = (room: Room) => room.find(FIND_MY_CREEPS, { filter: (creep) => creep.memory.role === this.RoleName });

  protected NeedToSpawn(room: Room): boolean {
    // Cannot spawn if RCL is wrong
    const rcl = room.controller?.level ?? -1;
    if (rcl < this.SpawnAtRCL || rcl >= this.StopSpawnAtRCL) {
      console.log(`${room}[${this.RoleName}]: RCL (${rcl}) LT ${this.SpawnAtRCL} or GE ${this.StopSpawnAtRCL}`);
      return false;
    };

    // or quota met
    const current = this.CreepsInRole(room).length;
    if (current >= this.CountPerRoom) {
      // console.log(`${room}[${this.RoleName}]: Quota Met ${current}/${this.CountPerRoom}`);
      return false;
    }

    // or a spawn is already in progress
    if (room.find(FIND_MY_SPAWNS, { filter: (s) => s.spawning }).length) {
      // console.log(`${room}[${this.RoleName}]: Another spawn is in progress.`);
      return false;
    }

    // console.log(`${room}[${this.RoleName}]: Spawn Needed.`);
    return true;
  }

  SpawnIfNeeded(room: Room): void {
    if (Game.time % this.SpawnRate !== 0) return; // Attempt spawn infrequently
    if (!this.NeedToSpawn(room)) return;          // Sometimes we don't need to spawn anything

    // It's Needed

    // Find a suitable spawn point
    const spawns = room.find(FIND_MY_SPAWNS, {
      filter: (spawn) => !spawn.spawning && spawn.store.energy >= this.RoleBodyCost()
    });
    if (spawns.length === 0) {
      return;
    }

    // Do the spawn
    const spawnPoint = spawns[0];
    console.log(`${room}[${this.RoleName}]: ${this.CreepsInRole(room).length}/${this.CountPerRoom} +1 @ ${spawnPoint}...`);
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
  CountPerRoom = 10;
  BodyParts = [WORK, CARRY, MOVE];

  DesiredRCL = 2;
  DowngradeStopThreshold = 1000;

  OnTick(creep: Creep, room: Room): void {
    if (creep.memory.jobMemory == null) {
      console.log(`${room}${creep}: OnTick: jobMemory == null`)
      this.Reassign(creep);
    }
    else if (creep.memory.jobMemory == undefined) {
      console.log(`${room}${creep}: OnTick: jobMemory == undefined`)
      this.Reassign(creep);
    }
    else if (this.IsDeliveryComplete(creep, room)) {
      // console.log(`${room}${creep}: OnTick: IsDeliveryComplete is true`)
      this.Reassign(creep);
    }
    else {
      this.Act(creep, room);
    }
  }

  Reassign(creep: Creep): void {
    const mem = (creep.memory.jobMemory as HarvesterMemory) = new HarvesterMemory();
    console.log(`Reassign ${creep}!`);

    // Harvest if we are empty
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
      const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
      if (source) {
        mem.target = source.id;
        mem.action = HarvesterAction.Harvest;
        creep.say("⛏️⚡️")
      } else {
        creep.say("🤷‍♂️⚡️");
      }
      return;
    }

    // Select target in order of priority
    var targetObject;

    // Spawns with room for energy
    targetObject = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
      filter: (structure) =>
        (structure.structureType === STRUCTURE_EXTENSION || structure.structureType === STRUCTURE_SPAWN)
        && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    });
    if (targetObject) {
      mem.target = targetObject.id;
      mem.action = HarvesterAction.Transfer;
      creep.say("🫴🎁");
      return;
    }

    // Controllers at risk of downgrade
    targetObject = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
      filter: (structure) =>
        structure.structureType === STRUCTURE_CONTROLLER
        && structure.ticksToDowngrade < this.DowngradeStopThreshold
    });
    if (targetObject) {
      mem.target = targetObject.id;
      mem.action = HarvesterAction.StopDowngrade;
      creep.say("🦸‍♀️");
      return;
    }

    // Pending Upgrades
    targetObject = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
      filter: (structure) => structure.structureType === STRUCTURE_CONTROLLER && structure.level < this.DesiredRCL
    });
    if (targetObject) {
      mem.target = targetObject.id;
      mem.action = HarvesterAction.Upgrade;
      creep.say("🆙");
      return;
    }

    // Structures in need of repair
    targetObject = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
      filter: (structure) => structure.hits < structure.hitsMax
    });
    if (targetObject) {
      mem.target = targetObject.id;
      mem.action = HarvesterAction.Repair;
      creep.say("🛠️");
      return;
    }

    // Ongoing Construction
    targetObject = creep.pos.findClosestByPath(FIND_MY_CONSTRUCTION_SITES, {
      filter: (site) => site.progress < site.progressTotal,
    });
    if (targetObject) {
      mem.target = targetObject.id;
      mem.action = HarvesterAction.Build;
      creep.say("🏗️");
      return;
    }

    // All Upgrades
    targetObject = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
      filter: (structure) => structure.structureType === STRUCTURE_CONTROLLER
    });
    if (targetObject) {
      mem.target = targetObject.id;
      mem.action = HarvesterAction.Upgrade;
      creep.say("🆙🆙🆙!!!");
      return;
    }

    creep.say("🥱");
  }

  Act(creep: Creep, room: Room): void {
    const m = creep.memory.jobMemory as HarvesterMemory;

    if (m.target == null || m.target == undefined) {
      console.log(`${room}${creep}: Act: ${creep} has null/undefined target in memory`)
      return;
    }
    const targetObject = Game.getObjectById(m.target);
    if (targetObject == null || targetObject == undefined) {
      console.log(`${room}${creep}: Act: ${creep} Game.getObjectById returned null`)
      return;
    }

    var result: number | null = null;
    switch (m.action) {
      case (HarvesterAction.Upgrade): {
        const t = targetObject as StructureController;
        result = creep.upgradeController(t);
        if (result === OK) console.log(`${room}${creep}: Act: Upgraded ${t} to level ${t.level} (${t.progress}/${t.progressTotal}) %${(t.progress / t.progressTotal * 100).toFixed(2)}.`);
        break;
      }
      case (HarvesterAction.Upgrade || HarvesterAction.StopDowngrade): {
        const t = targetObject as StructureController;
        result = creep.upgradeController(t);
        if (result === OK) console.log(`${room}${creep}: Act: Prevented Downgrade of ${t} in ${t.ticksToDowngrade}.`);
        break;
      }
      case (HarvesterAction.Build): {
        const t = targetObject as ConstructionSite;
        result = creep.build(t);
        if (result === OK) console.log(`${room}${creep}: Act: Built ${t} (${t.progress}/${t.progressTotal}) %${(t.progress / t.progressTotal * 100).toFixed(2)}.`);
        break;
      }
      case (HarvesterAction.Repair): {
        const t = targetObject as AnyOwnedStructure;
        result = creep.repair(t);
        if (result === OK) console.log(`${room}${creep}: Act: Repaired ${t} (${t.hits}/${t.hitsMax}) %${(t.hits / t.hitsMax * 100).toFixed(2)}.`);
        break;
      }
      case (HarvesterAction.Transfer): {
        const t = targetObject as AnyStoreStructure;
        result = creep.transfer(t, RESOURCE_ENERGY);
        // if (result === OK) console.log(`${room}${creep}: Act: Supplied ${t}.`);
        break;
      }
      case (HarvesterAction.Harvest): {
        const t = targetObject as Source;
        result = creep.harvest(t)
        // if (result === OK) console.log(`${room}${creep}: Act: Harvested ${t}.`);
        break;
      }
      default:
        return;
    }

    switch (result) {
      case OK:
        return;
      case ERR_NOT_IN_RANGE: {
        creep.moveTo(targetObject, { visualizePathStyle: { stroke: COLOURS.PATH_TARGET }, ignoreCreeps: true });
        return;
      }
      default: {
        console.log(`${room}${creep}: Act: ${m.action} for ${creep} was not successful: ${result}`);
        return;
      }
    }
  }

  IsDeliveryComplete(creep: Creep, room: Room): boolean {
    const m = creep.memory.jobMemory as HarvesterMemory;
    if (m.target == null || m.target == undefined) {
      console.log(`${room}${creep}: IsDeliveryComplete: ${creep} has null/undefined target in memory`)
      return true;
    }
    const targetObject = Game.getObjectById(m.target);
    if (targetObject == null || targetObject == undefined) {
      console.log(`${room}${creep}: IsDeliveryComplete: ${creep} Game.getObjectById returned null`)
      return true;
    }

    if (m.action !== HarvesterAction.Harvest && creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
      console.log(`${room}${creep}: IsDeliveryComplete: ${creep} ran out of Energy`)
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
