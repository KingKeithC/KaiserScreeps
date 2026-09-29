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

  interface RoomMemory {
    countPreventingDowngrade: number
    countPerformingUpgrade: number
  }

}
// Syntax for adding properties to `global` (ex "global.log")
declare const global: {
  log: any;
}

const COLOURS = {
  PATH_SHORT: "#08ed04",
  PATH_LONG: "#cb06c5",
}

abstract class Role {
  abstract RoleName: string;

  protected creep: Creep;
  protected room: Room;

  constructor(creep: Creep, room: Room) {
    this.creep = creep;
    this.room = room;
  }

  // How many creeps to have per room in this role
  abstract CountPerRoom: number;

  // Body for creeps spawned of this role
  abstract BodyParts: BodyPartConstant[];

  // RCL Ranges to constrain role
  SpawnAtRCL: number = 0;
  StopSpawnAtRCL: number = 100;

  // How ofter to check for spawn
  SpawnRate: number = 20;

  ReusePath: number = 10;
  ShortPathThreshold: number = 6;

  // Shared Tick Logic. Should be called via `super.Tick()` in child classes.
  Tick(): void {
    if (Game.time % this.SpawnRate !== 0) this.DoSpawns(); // Attempt spawn infrequently.
  }

  protected RoleBodyCost(): number {
    var total: number = 0;
    for (const part of this.BodyParts) total += BODYPART_COST[part];
    return total;
  }

  protected CreepsInRole = () => this.room.find(FIND_MY_CREEPS, { filter: (creep) => creep.memory.role === this.RoleName });

  DoSpawns(): void {
    // Cannot spawn if RCL is wrong
    const rcl = this.room.controller?.level ?? -1;
    if (rcl < this.SpawnAtRCL || rcl >= this.StopSpawnAtRCL) {
      console.log(`${this.room}[${this.RoleName}]: RCL (${rcl}) LT ${this.SpawnAtRCL} or GE ${this.StopSpawnAtRCL}`);
      return;
    };

    // or quota met
    const current = this.CreepsInRole().length;
    if (current >= this.CountPerRoom) {
      // console.log(`${this.room}[${this.RoleName}]: Quota Met ${current}/${this.CountPerRoom}`);
      return;
    }

    // or a spawn is already in progress
    if (this.room.find(FIND_MY_SPAWNS, { filter: (s) => s.spawning }).length) {
      // console.log(`${this.room}[${this.RoleName}]: Another spawn is in progress.`);
      return;
    }

    // or there isn't enough energy
    if (this.room.energyAvailable < this.RoleBodyCost()) {
      console.log(`${this.room}[${this.RoleName}]: Need to spawn, but lack the energy (costs ${this.RoleBodyCost()}, have ${this.room.energyAvailable}/${this.room.energyCapacityAvailable})...`);
      return;
    }

    // Find a suitable spawn point
    const spawns = this.room.find(FIND_MY_SPAWNS, { filter: (spawn) => !spawn.spawning });
    if (spawns.length === 0) {
      console.log(`${this.room}[${this.RoleName}]: Need to spawn, but no points are available or all are in use.`);
      return;
    }
    const spawnPoint = spawns[0];

    // Do the spawn
    const result = spawnPoint.spawnCreep(
      this.BodyParts,
      `${this.RoleName}-${Game.time}`,
      {
        memory: {
          room: this.room.name,
          role: this.RoleName,
          jobMemory: {},
        },
      }
    );

    // Log the result
    if (result === OK)
      console.log(`${this.room}[${this.RoleName}]: ${this.CreepsInRole().length}/${this.CountPerRoom} +1 Spawning @ ${spawnPoint}...`);
    else
      console.log(`${this.room}[${this.RoleName}]: ${spawnPoint} Spawn failed with result: ${result}...`);

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
  CountPerRoom = 3;
  BodyParts = [WORK, CARRY, MOVE];

  DesiredRCL = 2;
  DowngradeStopThreshold = 1000;
  WorkersPreventingDowngrade = 2;
  WorkersPerformingUpgrade = 2;

  Tick(): void {
    super.Tick();

    if (this.IsDeliveryComplete()) {
      console.log(`${this.room}${this.creep}: ${this.creep.memory.jobMemory}: Task Complete.`)
      this.Reassign();
    } else {
      this.Act();
    }
  }

  Reassign(): void {
    const mem = (this.creep.memory.jobMemory ?? {}) as HarvesterMemory;
    // console.log(`${room}${creep} Reassigned!`);

    // Run Cleanup Tasks
    if (mem.action === HarvesterAction.StopDowngrade)
      this.room.memory.countPreventingDowngrade -= 1;
    if (mem.action === HarvesterAction.Upgrade)
      this.room.memory.countPerformingUpgrade -= 1;

    // Reset target, and set new Task
    mem.target = null;

    // Harvest if we are empty
    if (this.creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
      const source = this.creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
      if (source) {
        mem.target = source.id;
        mem.action = HarvesterAction.Harvest;
        this.creep.say("⛏️⚡️")
      } else {
        this.creep.say("🤷‍♂️⚡️");
      }
      return;
    }

    // Select target in order of priority
    var targetObject;

    // Spawns with room for energy
    targetObject = this.creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
      filter: (structure) =>
        (structure.structureType === STRUCTURE_EXTENSION || structure.structureType === STRUCTURE_SPAWN)
        && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    });
    if (targetObject) {
      mem.target = targetObject.id;
      mem.action = HarvesterAction.Transfer;
      this.creep.say("🫴🎁");
      return;
    }

    // Controllers at risk of downgrade
    if (this.room.memory.countPreventingDowngrade < this.WorkersPreventingDowngrade) {
      targetObject = this.creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
        filter: (structure) =>
          structure.structureType === STRUCTURE_CONTROLLER
          && structure.ticksToDowngrade < this.DowngradeStopThreshold
      });
      if (targetObject) {
        mem.target = targetObject.id;
        mem.action = HarvesterAction.StopDowngrade;
        this.room.memory.countPreventingDowngrade += 1;
        this.creep.say("🦸‍♀️");
        return;
      }
    }

    // Pending Upgrades
    if (this.room.memory.countPerformingUpgrade < this.WorkersPerformingUpgrade) {
      targetObject = this.creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
        filter: (structure) => structure.structureType === STRUCTURE_CONTROLLER && structure.level < this.DesiredRCL
      });
      if (targetObject) {
        mem.target = targetObject.id;
        mem.action = HarvesterAction.Upgrade;
        this.room.memory.countPerformingUpgrade += 1;
        this.creep.say("🆙");
        return;
      }
    }

    // Structures in need of repair
    targetObject = this.creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
      filter: (structure) => structure.hits < structure.hitsMax
    });
    if (targetObject) {
      mem.target = targetObject.id;
      mem.action = HarvesterAction.Repair;
      this.creep.say("🛠️");
      return;
    }

    // Ongoing Construction
    targetObject = this.creep.pos.findClosestByPath(FIND_MY_CONSTRUCTION_SITES, {
      filter: (site) => site.progress < site.progressTotal,
    });
    if (targetObject) {
      mem.target = targetObject.id;
      mem.action = HarvesterAction.Build;
      this.creep.say("🏗️");
      return;
    }

    // All Upgrades
    targetObject = this.creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
      filter: (structure) => structure.structureType === STRUCTURE_CONTROLLER
    });
    if (targetObject) {
      mem.target = targetObject.id;
      mem.action = HarvesterAction.Upgrade;
      this.creep.say("🆙🆙🆙!!!");
      return;
    }

    this.creep.say("🥱");
  }

  Act(): void {
    const m = this.creep.memory.jobMemory as HarvesterMemory;

    if (m.target == null || m.target == undefined) {
      console.log(`${this.room}${this.creep}: Act: ${this.creep} has null/undefined target in memory`)
      return;
    }
    const targetObject = Game.getObjectById(m.target);
    if (targetObject == null || targetObject == undefined) {
      console.log(`${this.room}${this.creep}: Act: ${this.creep} Game.getObjectById returned null`)
      return;
    }

    var result: number | null = null;
    switch (m.action) {
      case (HarvesterAction.Upgrade): {
        const t = targetObject as StructureController;
        result = this.creep.upgradeController(t);
        if (result === OK) console.log(`${this.room}${this.creep}: Act: Upgraded ${t} to RCL ${t.level} (${t.progress}/${t.progressTotal}) %${(t.progress / t.progressTotal * 100).toFixed(2)}.`);
        break;
      }
      case (HarvesterAction.StopDowngrade): {
        const t = targetObject as StructureController;
        result = this.creep.upgradeController(t);
        if (result === OK) console.log(`${this.room}${this.creep}: Act: Prevented Downgrade of ${t} in ${t.ticksToDowngrade}.`);
        break;
      }
      case (HarvesterAction.Build): {
        const t = targetObject as ConstructionSite;
        result = this.creep.build(t);
        if (result === OK) console.log(`${this.room}${this.creep}: Act: Built ${t} (${t.progress}/${t.progressTotal}) %${(t.progress / t.progressTotal * 100).toFixed(2)}.`);
        break;
      }
      case (HarvesterAction.Repair): {
        const t = targetObject as AnyOwnedStructure;
        result = this.creep.repair(t);
        if (result === OK) console.log(`${this.room}${this.creep}: Act: Repaired ${t} (${t.hits}/${t.hitsMax}) %${(t.hits / t.hitsMax * 100).toFixed(2)}.`);
        break;
      }
      case (HarvesterAction.Transfer): {
        const t = targetObject as AnyStoreStructure;
        result = this.creep.transfer(t, RESOURCE_ENERGY);
        // if (result === OK) console.log(`${this.room}${this.creep}: Act: Supplied ${t}.`);
        break;
      }
      case (HarvesterAction.Harvest): {
        const t = targetObject as Source;
        result = this.creep.harvest(t)
        // if (result === OK) console.log(`${this.room}${this.creep}: Act: Harvested ${t}.`);
        break;
      }
      default:
        return;
    }

    switch (result) {
      case OK:
        return;
      case ERR_NOT_IN_RANGE: {
        const range = this.creep.pos.getRangeTo(targetObject);

        // Move Long if we are farther than ShortPathThreshold away.
        var moveOutcome: number = OK;
        if (range > this.ShortPathThreshold)
          moveOutcome = this.creep.moveTo(targetObject, { visualizePathStyle: { stroke: COLOURS.PATH_LONG, lineStyle: "solid" }, reusePath: this.ReusePath, ignoreCreeps: true });

        // Move Short otherwise
        if (range <= this.ShortPathThreshold)
          moveOutcome = this.creep.moveTo(targetObject, { visualizePathStyle: { stroke: COLOURS.PATH_SHORT, lineStyle: "dotted" } });

        // console.log(`${room}${creep}: Act: MoveTo for ${creep} resulted in: ${moveOutcome}`);

        if (moveOutcome === ERR_NO_PATH)
          this.Reassign();

        return;
      }
      default: {
        console.log(`${this.room}${this.creep}: Act: ${m.action} for ${this.creep} was not successful: ${result}`);
        return;
      }
    }
  }

  IsDeliveryComplete(): boolean {
    const m = (this.creep.memory.jobMemory ?? {}) as HarvesterMemory;
    if (m.target == null || m.target == undefined) {
      // console.log(`${room}${creep}: IsDeliveryComplete: ${creep} has null/undefined target in memory`)
      return true;
    }
    const targetObject = Game.getObjectById(m.target);
    if (targetObject == null || targetObject == undefined) {
      // console.log(`${room}${creep}: IsDeliveryComplete: ${creep} Game.getObjectById returned null`)
      return true;
    }

    if (m.action !== HarvesterAction.Harvest && this.creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
      // console.log(`${room}${creep}: IsDeliveryComplete: ${creep} ran out of Energy`)
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
        return this.creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0;
      }
      default:
        return true;
    }
  }
}

class HarvesterT2 extends Harvester {
  RoleName = "harvesterT2";

  SpawnAtRCL = 2;
  CountPerRoom = 5;
  BodyParts = [MOVE, WORK, WORK, CARRY, CARRY, CARRY];

  DesiredRCL = 3;
  DowngradeStopThreshold = 2000;
}

const MainLoop = () => {
  // Automatically delete memory of missing creeps
  for (const name in Memory.creeps) {
    if (!(name in Game.creeps)) {
      console.log(`Cleanup memory for ${name}`);
      delete Memory.creeps[name];
    }
  }

  for (const room of Object.values(Game.rooms)) {

    // Init Room Memory
    if (room.memory.countPreventingDowngrade == null || room.memory.countPreventingDowngrade == undefined || room.memory.countPreventingDowngrade < 0)
      room.memory.countPreventingDowngrade = 0;
    if (room.memory.countPerformingUpgrade == null || room.memory.countPerformingUpgrade == undefined || room.memory.countPerformingUpgrade < 0)
      room.memory.countPerformingUpgrade = 0;

    // Tick each creep
    for (const creep of room.find(FIND_MY_CREEPS)) {
      var role: Role | null = null;

      if (creep.memory.role === "harvester")
        role = new Harvester(creep, room);
      if (creep.memory.role === "harvesterT2")
        role = new HarvesterT2(creep, room);
      else
        role = new Harvester(creep, room)

      if (role == null) continue;
      role.Tick();
    }
  }
}

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
export const loop = ErrorMapper.wrapLoop(MainLoop);
