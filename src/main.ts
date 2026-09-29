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
    lastSpawnTick: { [roleName: string]: number }
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

  protected room: Room;

  constructor(room: Room) {
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
  SpawnRate: number = 80;

  ReusePath: number = 10;
  ShortPathThreshold: number = 6;

  abstract Tick(): void;

  protected RoleBodyCost(): number {
    var total: number = 0;
    for (const part of this.BodyParts) total += BODYPART_COST[part];
    return total;
  }

  protected CreepsInRole = () => this.room.find(FIND_MY_CREEPS, { filter: (creep) => creep.memory.role === this.RoleName });

  DoSpawns(): void {
    const timeSinceSpawn = Game.time - (this.room.memory.lastSpawnTick[this.RoleName] ?? 0);
    if (timeSinceSpawn < this.SpawnRate) return; // Not ready
    this.room.memory.lastSpawnTick[this.RoleName] = Game.time; // Reset

    // Cannot spawn if RCL is wrong
    const rcl = this.room.controller?.level ?? 0;
    if (rcl < this.SpawnAtRCL || rcl >= this.StopSpawnAtRCL) {
      console.log(`${this.room}[${this.RoleName}]: RCL (${rcl}) LT ${this.SpawnAtRCL} or GE ${this.StopSpawnAtRCL}`);
      return;
    };

    // or quota met
    const current = this.CreepsInRole().length;
    if (current >= this.CountPerRoom) {
      console.log(`${this.room}[${this.RoleName}]: ${Game.time} Quota Met ${current}/${this.CountPerRoom}`);
      return;
    }

    // or a spawn is already in progress
    if (this.room.find(FIND_MY_SPAWNS, { filter: (s) => s.spawning }).length) {
      console.log(`${this.room}[${this.RoleName}]: Another spawn is in progress.`);
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
  Idle = '💤',
  Harvest = '⛏️',
  Upgrade = '🆙',
  StopDowngrade = '🦸‍♀️',
  Build = '🏗️',
  Repair = '🛠️',
  Transfer = '🫴',
}

class HarvesterMemory extends Object {
  readonly action: HarvesterAction;
  readonly target: Id<ConstructionSite<BuildableStructureConstant> | AnyOwnedStructure | Source> | null;

  constructor(action: HarvesterAction, id: Id<ConstructionSite<BuildableStructureConstant> | AnyOwnedStructure | Source> | null = null) {
    super();

    if (id == null && action !== HarvesterAction.Idle) {
      throw new Error(`Id was null with a non idle action: ${action}`);
    }

    this.action = action;
    this.target = id;
  }
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
    for (const creep of this.CreepsInRole()) {
      this.Act(creep);
      if (this.IsActComplete(creep)) {
        console.log(`${this.room}${creep}: Finished: ${JSON.stringify(creep.memory.jobMemory)}`)
        creep.memory.jobMemory = this.Reassign(creep);
        console.log(`${this.room}${creep} Reassigned: ${JSON.stringify(creep.memory.jobMemory)}`);
        creep.say((creep.memory.jobMemory as HarvesterMemory).action);
      } else {
      }
    }
  }

  Reassign(creep: Creep): HarvesterMemory {
    const mem = creep.memory.jobMemory as HarvesterMemory;
    // console.log(`${room}${creep} Reassigned!`);

    // Run Cleanup Tasks
    if (mem.action === HarvesterAction.StopDowngrade)
      this.room.memory.countPreventingDowngrade -= 1;
    if (mem.action === HarvesterAction.Upgrade)
      this.room.memory.countPerformingUpgrade -= 1;

    // Harvest if we are empty
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
      const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
      if (source) {
        return new HarvesterMemory(HarvesterAction.Harvest, source.id);
      } else {
        return new HarvesterMemory(HarvesterAction.Idle);
      }
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
      return new HarvesterMemory(HarvesterAction.Transfer, targetObject.id);
    }

    // Controllers at risk of downgrade
    if (this.room.memory.countPreventingDowngrade < this.WorkersPreventingDowngrade) {
      targetObject = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
        filter: (structure) =>
          structure.structureType === STRUCTURE_CONTROLLER
          && structure.ticksToDowngrade < this.DowngradeStopThreshold
      });
      if (targetObject) {
        this.room.memory.countPreventingDowngrade += 1;
        return new HarvesterMemory(HarvesterAction.StopDowngrade, targetObject.id);
      }
    }

    // Pending Upgrades
    if (this.room.memory.countPerformingUpgrade < this.WorkersPerformingUpgrade) {
      targetObject = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
        filter: (structure) => structure.structureType === STRUCTURE_CONTROLLER && structure.level < this.DesiredRCL
      });
      if (targetObject) {
        this.room.memory.countPerformingUpgrade += 1;
        return new HarvesterMemory(HarvesterAction.Upgrade, targetObject.id);
      }
    }

    // Structures in need of repair
    targetObject = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
      filter: (structure) => structure.hits < structure.hitsMax
    });
    if (targetObject) {
      return new HarvesterMemory(HarvesterAction.Repair, targetObject.id);
    }

    // Ongoing Construction
    targetObject = creep.pos.findClosestByPath(FIND_MY_CONSTRUCTION_SITES, {
      filter: (site) => site.progress < site.progressTotal,
    });
    if (targetObject) {
      return new HarvesterMemory(HarvesterAction.Build, targetObject.id);
    }

    // All Upgrades
    targetObject = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
      filter: (structure) => structure.structureType === STRUCTURE_CONTROLLER
    });
    if (targetObject) {
      return new HarvesterMemory(HarvesterAction.Upgrade, targetObject.id);
    }

    return new HarvesterMemory(HarvesterAction.Idle);
  }

  Act(creep: Creep): void {
    const mem = creep.memory.jobMemory as HarvesterMemory;

    if (mem.target == null || mem.target == undefined) {
      console.log(`${this.room}${creep}: Act: ${creep} has null/undefined target in memory`)
      // If we just spawned this can happen
      return;
    }
    const targetObject = Game.getObjectById(mem.target);
    if (targetObject == null || targetObject == undefined) {
      console.log(`${this.room}${creep}: Act: ${creep} Game.getObjectById returned null`)
      return;
    }

    var result: number | null = null;
    switch (mem.action) {
      case (HarvesterAction.Upgrade): {
        const t = targetObject as StructureController;
        result = creep.upgradeController(t);
        if (result === OK) console.log(`${this.room}${creep}: Act: Upgraded ${t} to RCL ${t.level} (${t.progress}/${t.progressTotal}) %${(t.progress / t.progressTotal * 100).toFixed(2)}.`);
        break;
      }
      case (HarvesterAction.StopDowngrade): {
        const t = targetObject as StructureController;
        result = creep.upgradeController(t);
        if (result === OK) console.log(`${this.room}${creep}: Act: Prevented Downgrade of ${t} in ${t.ticksToDowngrade}.`);
        break;
      }
      case (HarvesterAction.Build): {
        const t = targetObject as ConstructionSite;
        result = creep.build(t);
        if (result === OK) console.log(`${this.room}${creep}: Act: Built ${t} (${t.progress}/${t.progressTotal}) %${(t.progress / t.progressTotal * 100).toFixed(2)}.`);
        break;
      }
      case (HarvesterAction.Repair): {
        const t = targetObject as AnyOwnedStructure;
        result = creep.repair(t);
        if (result === OK) console.log(`${this.room}${creep}: Act: Repaired ${t} (${t.hits}/${t.hitsMax}) %${(t.hits / t.hitsMax * 100).toFixed(2)}.`);
        break;
      }
      case (HarvesterAction.Transfer): {
        const t = targetObject as AnyStoreStructure;
        result = creep.transfer(t, RESOURCE_ENERGY);
        // if (result === OK) console.log(`${this.room}${creep}: Act: Supplied ${t}.`);
        break;
      }
      case (HarvesterAction.Harvest): {
        const t = targetObject as Source;
        result = creep.harvest(t)
        // if (result === OK) console.log(`${this.room}${creep}: Act: Harvested ${t}.`);
        break;
      }
      default:
        return;
    }

    switch (result) {
      case OK:
        return;
      case ERR_NOT_ENOUGH_RESOURCES: {
        this.Reassign(creep);
        return;
      }
      case ERR_NOT_IN_RANGE: {
        const range = creep.pos.getRangeTo(targetObject);

        // Move Long if we are farther than ShortPathThreshold away.
        var moveOutcome: number = OK;
        if (range > this.ShortPathThreshold)
          moveOutcome = creep.moveTo(targetObject, { visualizePathStyle: { stroke: COLOURS.PATH_LONG, lineStyle: "solid" }, reusePath: this.ReusePath, ignoreCreeps: true });

        // Move Short otherwise
        if (range <= this.ShortPathThreshold)
          moveOutcome = creep.moveTo(targetObject, { visualizePathStyle: { stroke: COLOURS.PATH_SHORT, lineStyle: "dotted" } });

        // console.log(`${room}${creep}: Act: MoveTo for ${creep} resulted in: ${moveOutcome}`);

        if (moveOutcome === ERR_NO_PATH)
          this.Reassign(creep);

        return;
      }
      default: {
        console.log(`${this.room}${creep}: Act: ${mem.action} for ${creep} was not successful: ${result}`);
        this.Reassign(creep);
        return;
      }
    }
  }

  IsActComplete(creep: Creep): boolean {
    const mem = creep.memory.jobMemory as HarvesterMemory;

    if (!mem) {
      console.log(`${this.room}${creep}: IsDeliveryComplete: amnesia`);
      return true;
    }

    if (!mem.action) {
      console.log(`${this.room}${creep}: IsDeliveryComplete: missing action`);
      // If we just spawned this can happen
      return true;
    }

    // Idle tasks are always done.
    if (mem.action === HarvesterAction.Idle) return true;

    if (!mem.target) {
      // console.log(`${this.room}${creep}: IsDeliveryComplete: null/undefined target in memory`)
      return true;
    }

    const targetObject = Game.getObjectById(mem.target);
    if (!targetObject) {

      if (mem.action !== HarvesterAction.Build)
        console.log(`${this.room}${creep}: IsDeliveryComplete: Game.getObjectById of ${mem.target} is null`)
      // else
      // console.log(`${this.room}${creep}: IsDeliveryComplete: Construction Finished!`)

      return true;
    }

    if (mem.action !== HarvesterAction.Harvest && creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
      // console.log(`${this.room}${creep}: IsDeliveryComplete: out of Energy`)
      return true;
    }

    switch (mem.action) {
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
    }
  }
}

class HarvesterT2 extends Harvester {
  RoleName = "harvesterT2";

  SpawnAtRCL = 2;
  CountPerRoom = 5;
  BodyParts = [MOVE, MOVE, WORK, WORK, WORK, CARRY, CARRY, CARRY];

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
    if (room.memory.lastSpawnTick == null || room.memory.lastSpawnTick == undefined)
      room.memory.lastSpawnTick = {};

    // Run each role in the room
    for (const role of [
      new Harvester(room),
      new HarvesterT2(room)
    ]) {
      role.DoSpawns();
      role.Tick();
    }
  }
}

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
export const loop = ErrorMapper.wrapLoop(MainLoop);
