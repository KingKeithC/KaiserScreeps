import { Role } from "role";

enum HarvesterAction {
  Idle = '💤',
  Harvest = '⛏️',
  CollectEnergy = '🔌',
  Upgrade = '🆙',
  StopDowngrade = '🦸‍♀️',
  Build = '🏗️',
  Repair = '🛠️',
  Transfer = '🫴',
  IdleUpgrade = '🔼',
}

class HarvesterMemory extends Object {
  readonly action: HarvesterAction;
  readonly target: Id<ConstructionSite<BuildableStructureConstant> | AnyOwnedStructure | Source | Creep> | null;

  constructor(action: HarvesterAction, id: Id<ConstructionSite<BuildableStructureConstant> | AnyOwnedStructure | Source | Creep> | null = null) {
    super();

    if (id == null && action !== HarvesterAction.Idle) {
      throw new Error(`Id was null with a non idle action: ${action}`);
    }

    this.action = action;
    this.target = id;
  }
}

export class Harvester extends Role {
  RoleName = "harvester";

  StartSpawnAtRCL = 0;
  StopSpawnAtRCL = 3;
  UpgradeToRCL = 2;
  CountPerRoom = 1;
  BodyParts = [WORK, CARRY, MOVE];

  DowngradeStopThreshold = 5000;
  WorkersPreventingDowngrade = 2;
  WorkersPerformingUpgrade = 2;
  WorkersPerformingTransfer = 4;
  InitialJobMemory = new HarvesterMemory(HarvesterAction.Idle);
  MinerSearchRange = 20;

  Tick(): void {
    for (const creep of this.CreepsInRole()) {
      this.Act(creep);
      if (this.IsActComplete(creep)) {
        const oldMem = JSON.stringify(creep.memory.jobMemory);
        creep.memory.jobMemory = this.Reassign(creep);
        console.log(`${this.room}${creep} Reassigned: ${oldMem} -> ${JSON.stringify(creep.memory.jobMemory)}`);
        creep.say((creep.memory.jobMemory as HarvesterMemory).action);
      }
    }
  }

  Reassign(creep: Creep): HarvesterMemory {
    const mem = creep.memory.jobMemory as HarvesterMemory;

    // Run Cleanup Tasks
    if (mem.action === HarvesterAction.StopDowngrade)
      this.room.memory.countPreventingDowngrade -= 1;

    if (mem.action === HarvesterAction.Upgrade)
      this.room.memory.countPerformingUpgrade -= 1;

    // If we are out of energy
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {

      // Collect from the fullest miner nearby if there are any
      const miner = creep.pos.findInRange(FIND_MY_CREEPS, this.MinerSearchRange, { filter: (c) => c.memory.role === "Miner" && c.store.energy > 0 })
        .sort((a, b) => a.store.energy - b.store.energy).pop()
      if (miner != null && miner != undefined)
        return new HarvesterMemory(HarvesterAction.CollectEnergy, miner.id);

      // Do harverting on our own
      const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
      if (source) {
        return new HarvesterMemory(HarvesterAction.Harvest, source.id);
      }

      // Nothing to do without energy
      return new HarvesterMemory(HarvesterAction.Idle);
    }

    // Select target in order of priority
    var targetObject;

    // Spawns/Extensions with room for energy
    targetObject = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
      filter: (structure) =>
        (structure.structureType === STRUCTURE_EXTENSION || structure.structureType === STRUCTURE_SPAWN)
        && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    });
    if (targetObject) {
      return new HarvesterMemory(HarvesterAction.Transfer, targetObject.id);
    }

    // Towers with room for energy
    targetObject = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
      filter: (structure) => structure.structureType === STRUCTURE_TOWER && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
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
      if (this.room.controller && this.room.controller.level < this.UpgradeToRCL) {
        this.room.memory.countPerformingUpgrade += 1;
        return new HarvesterMemory(HarvesterAction.Upgrade, this.room.controller.id);
      }
    }

    // Ongoing Construction
    targetObject = creep.pos.findClosestByPath(FIND_MY_CONSTRUCTION_SITES, {
      filter: (site) => site.progress < site.progressTotal,
    });
    if (targetObject) {
      return new HarvesterMemory(HarvesterAction.Build, targetObject.id);
    }

    // Structures in need of repair
    targetObject = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
      filter: (structure) => structure.hits < structure.hitsMax
    });
    if (targetObject) {
      return new HarvesterMemory(HarvesterAction.Repair, targetObject.id);
    }

    // Nothing else to do so just upgrade forever
    if (this.room.controller)
      return new HarvesterMemory(HarvesterAction.IdleUpgrade, this.room.controller.id);

    return new HarvesterMemory(HarvesterAction.Idle);
  }

  Act(creep: Creep): void {
    const mem = creep.memory.jobMemory as HarvesterMemory;

    // Target may be null in this one case
    if (mem.target == null && mem.action === HarvesterAction.Idle)
      return;

    if (mem.target == null || mem.target == undefined) {

      // If we just spawned this can happen
      if (creep.ticksToLive && creep.ticksToLive === CREEP_LIFE_TIME)
        console.log(`${this.room}${creep}: Happy Birthday!!!`)
      else
        console.log(`${this.room}${creep}: Act: ${creep} has null/undefined target in memory`)

      return;
    }
    const targetObject = Game.getObjectById(mem.target);
    if (targetObject == null || targetObject == undefined) {

      if (mem.action === HarvesterAction.Build)
        console.log(`${this.room}${creep}: Act: ${creep} Finished a construction!`)
      else
        console.log(`${this.room}${creep}: Act: ${creep} Game.getObjectById returned null`)
      return;
    }

    var minDistance = 3;
    if (mem.action === HarvesterAction.Harvest || mem.action === HarvesterAction.Transfer || mem.action === HarvesterAction.CollectEnergy)
      minDistance = 1;

    const moveResult = this.MoveCreep(creep, targetObject.pos, minDistance);
    if (moveResult < 0) {
      console.log(`${this.room}${creep}: Act: Issue with Moving ${moveResult}`)
      return; // There was an issue moving, so skip the act
    } else if (moveResult === OK) {
      // console.log(`${this.room}${creep}: Act: Moved`)
      if (creep.fatigue) return; // We moved and are fatigued, so skip acting
    }

    var result: number = OK;
    switch (mem.action) {
      case (HarvesterAction.CollectEnergy): {
        // No action as we should already have moved nearby
        console.log(`${this.room}${creep}: Awaiting energy transfer (${creep.store.energy}/${creep.store.getCapacity(RESOURCE_ENERGY)}).`);
        break;
      }
      case (HarvesterAction.Upgrade || HarvesterAction.IdleUpgrade || HarvesterAction.StopDowngrade): {
        const t = targetObject as StructureController;
        result = creep.upgradeController(t);
        // if (result === OK) console.log(`${this.room}${creep}: Act: Upgraded ${t} to RCL ${t.level} (${t.progress}/${t.progressTotal}) %${(t.progress / t.progressTotal * 100).toFixed(2)}.`);
        break;
      }
      case (HarvesterAction.Build): {
        const t = targetObject as ConstructionSite;
        result = creep.build(t);
        // if (result === OK) console.log(`${this.room}${creep}: Act: Built ${t} (${t.progress}/${t.progressTotal}) %${(t.progress / t.progressTotal * 100).toFixed(2)}.`);
        break;
      }
      case (HarvesterAction.Repair): {
        const t = targetObject as AnyOwnedStructure;
        result = creep.repair(t);
        // if (result === OK) console.log(`${this.room}${creep}: Act: Repaired ${t} (${t.hits}/${t.hitsMax}) %${(t.hits / t.hitsMax * 100).toFixed(2)}.`);
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
      case ERR_FULL:
      case ERR_NOT_ENOUGH_RESOURCES: {
        // These are fine, and should be handled by IsActComplete.
        return;
      }
      case ERR_NOT_IN_RANGE: {
        console.log(`${this.room}${creep}: Not in range to act.`);
        return;
      }
      default: {
        console.log(`${this.room}${creep}: Act: ${mem.action} for ${creep} was not successful: ${result}`);
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
    if (mem.action === HarvesterAction.Idle)
      return true;

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

    switch (mem.action) {
      case (HarvesterAction.Harvest):
      case (HarvesterAction.CollectEnergy):
        return creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0;
      case (HarvesterAction.Upgrade): {
        if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) return true;
        const t = targetObject as StructureController;
        return t.level >= this.UpgradeToRCL;
      }
      case (HarvesterAction.StopDowngrade): {
        if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) return true;
        const t = targetObject as StructureController;
        return t.ticksToDowngrade >= this.DowngradeStopThreshold
      }
      case (HarvesterAction.Build): {
        if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) return true;
        const t = targetObject as ConstructionSite;
        return t.progress === t.progressTotal;
      }
      case (HarvesterAction.Repair): {
        if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) return true;
        const t = targetObject as AnyOwnedStructure;
        return t.hits === t.hitsMax;
      }
      case (HarvesterAction.Transfer): {
        if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) return true;
        const t = targetObject as AnyStoreStructure;
        return t.store.getFreeCapacity(RESOURCE_ENERGY) === 0;
      }
      default:
        return true;
    }
  }
}

export class HarvesterT2 extends Harvester {
  RoleName = "harvesterT2";

  StartSpawnAtRCL = 2;
  StopSpawnAtRCL = 100;
  UpgradeToRCL = 8;
  CountPerRoom = 5;
  BodyParts = [MOVE, MOVE, WORK, WORK, WORK, CARRY, CARRY, CARRY];
}
