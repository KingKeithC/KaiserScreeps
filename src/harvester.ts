import { Role } from "role";
import { COLOURS } from "utils/Colours";

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

export class Harvester extends Role {
  RoleName = "harvester";

  SpawnAtRCL = 0;
  CountPerRoom = 1;
  BodyParts = [WORK, CARRY, MOVE];

  DesiredRCL = 2;
  DowngradeStopThreshold = 1000;
  WorkersPreventingDowngrade = 2;
  WorkersPerformingUpgrade = 2;
  WorkersPerformingTransfer = 3;
  InitialJobMemory = new HarvesterMemory(HarvesterAction.Idle);

  Tick(): void {
    for (const creep of this.CreepsInRole()) {
      this.Act(creep);
      if (this.IsActComplete(creep)) {
        console.log(`${this.room}${creep}: Finished: ${JSON.stringify(creep.memory.jobMemory)}`)
        creep.memory.jobMemory = this.Reassign(creep);
        console.log(`${this.room}${creep} Reassigned: ${JSON.stringify(creep.memory.jobMemory)}`);
        creep.say((creep.memory.jobMemory as HarvesterMemory).action);
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

    if (mem.action === HarvesterAction.Transfer)
      this.room.memory.countPerformingTransfer -= 1;

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
    if (this.room.memory.countPerformingTransfer < this.WorkersPerformingTransfer) {
      targetObject = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
        filter: (structure) =>
          (structure.structureType === STRUCTURE_EXTENSION || structure.structureType === STRUCTURE_SPAWN)
          && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
      });
      if (targetObject) {
        this.room.memory.countPerformingTransfer += 1;
        return new HarvesterMemory(HarvesterAction.Transfer, targetObject.id);
      }
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

    var result: number | null = null;
    switch (mem.action) {
      case (HarvesterAction.Upgrade): {
        const t = targetObject as StructureController;
        result = creep.upgradeController(t);
        // if (result === OK) console.log(`${this.room}${creep}: Act: Upgraded ${t} to RCL ${t.level} (${t.progress}/${t.progressTotal}) %${(t.progress / t.progressTotal * 100).toFixed(2)}.`);
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
        // Can't move anyways so don't bother
        if (creep.fatigue) return;

        const range = creep.pos.getRangeTo(targetObject);

        var moveOutcome: number = OK;
        if (range > this.ShortPathThreshold)
          // Move Long if we are farther than ShortPathThreshold away.
          moveOutcome = creep.moveTo(targetObject, { visualizePathStyle: { stroke: COLOURS.PATH_LONG, lineStyle: "solid" }, reusePath: this.ReusePath, ignoreCreeps: true, range: 3, maxOps: 300 });
        else
          // Move Short otherwise
          moveOutcome = creep.moveTo(targetObject, { visualizePathStyle: { stroke: COLOURS.PATH_SHORT, lineStyle: "dotted" }, range: 1 });

        // console.log(`${room}${creep}: Act: MoveTo for ${creep} resulted in: ${moveOutcome}`);
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

export class HarvesterT2 extends Harvester {
  RoleName = "harvesterT2";

  SpawnAtRCL = 2;
  CountPerRoom = 10;
  BodyParts = [MOVE, MOVE, WORK, WORK, WORK, CARRY, CARRY, CARRY];

  DesiredRCL = 3;
  DowngradeStopThreshold = 2000;
}
