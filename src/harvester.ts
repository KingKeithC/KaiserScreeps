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
  Pickup = "🧹"
}

class HarvesterMemory extends Object {
  readonly action: HarvesterAction;
  readonly target: Id<ConstructionSite<BuildableStructureConstant> | AnyOwnedStructure | Source | Creep | Resource | StructureContainer> | null;

  constructor(action: HarvesterAction, id: Id<ConstructionSite<BuildableStructureConstant> | AnyOwnedStructure | Source | Creep | Resource | StructureContainer> | null = null) {
    super();

    if (id == null && action !== HarvesterAction.Idle) {
      throw new Error(`Id was null with a non idle action: ${action}`);
    }

    this.action = action;
    this.target = id;
  }
}

export class Harvester extends Role<HarvesterMemory> {
  RoleName = "harvester";

  StartSpawnAtRCL = 0;
  StopSpawnAtRCL = 4;
  UpgradeToRCL = 2;
  BodyParts = [WORK, CARRY, MOVE];

  get CountPerRoom() {
    const max = 4;
    const T2 = Object.values(Game.creeps).filter(c => c.memory.room === this.room.name && c.memory.role === 'harvesterT2').length;
    return max - T2 <= 0 ? 0 : max - T2;
  }

  DowngradeStopThreshold = 5000;
  WorkersPreventingDowngrade = 2;
  WorkersPerformingUpgrade = 2;
  WorkersPerformingTransfer = 4;
  InitialJobMemory = new HarvesterMemory(HarvesterAction.Idle);
  MinerSearchRange = 20;

  TickCreep(creep: Creep, currentTask: HarvesterMemory): void {
    if (this.IsActComplete(creep, currentTask)) {
      const newTask = this.Reassign(creep, currentTask);
      console.log(`${this.room}${creep} Reassigned: ${JSON.stringify(currentTask)} -> ${JSON.stringify(newTask)}`);
      creep.say(newTask.action);
      creep.memory.jobMemory = newTask;
    } else {
      this.Act(creep, currentTask);
    }
  }

  Reassign(creep: Creep, oldMem: HarvesterMemory): HarvesterMemory {
    // Run Cleanup Tasks
    if (oldMem.action === HarvesterAction.StopDowngrade)
      this.room.memory.countPreventingDowngrade -= 1;

    if (oldMem.action === HarvesterAction.Upgrade)
      this.room.memory.countPerformingUpgrade -= 1;

    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0)
      return this.FindGatheringTask(creep);
    else
      return this.FindSpendingTask(creep);
  }

  FindSpendingTask(creep: Creep): HarvesterMemory {
    // Select target in order of priority
    var targetObject;

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

    // Towers with room for energy
    targetObject = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
      filter: (structure) => structure.structureType === STRUCTURE_TOWER && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    });
    if (targetObject) {
      return new HarvesterMemory(HarvesterAction.Transfer, targetObject.id);
    }

    // Spawns/Extensions with room for energy
    targetObject = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
      filter: (structure) =>
        (structure.structureType === STRUCTURE_EXTENSION || structure.structureType === STRUCTURE_SPAWN)
        && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    });
    if (targetObject) {
      return new HarvesterMemory(HarvesterAction.Transfer, targetObject.id);
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
      if (this.room.controller && this.room.controller.level < this.UpgradeToRCL) {
        this.room.memory.countPerformingUpgrade += 1;
        return new HarvesterMemory(HarvesterAction.Upgrade, this.room.controller.id);
      }
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

    // Default
    return new HarvesterMemory(HarvesterAction.Idle);
  }

  FindGatheringTask(creep: Creep): HarvesterMemory {
    // Dropped seems to be broken most of the time, skip it
    // const dropped = this.room.find(FIND_DROPPED_RESOURCES, { filter: res => res.resourceType === RESOURCE_ENERGY }).pop();
    // if (dropped != null && dropped != undefined)
    //   return new HarvesterMemory(HarvesterAction.Pickup, dropped.id)

    const container = this.room.find(FIND_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.store.energy > 0 }).pop() as StructureContainer;
    if (container != null && container != undefined)
      return new HarvesterMemory(HarvesterAction.CollectEnergy, container.id);

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

  Act(creep: Creep, task: HarvesterMemory): void {
    // Validate Target
    if (task.target == null || task.target == undefined) {
      // Target may be null in this one case
      if (task.action === HarvesterAction.Idle) return;

      console.log(`${this.room}${creep}: Act: ${creep} has null/undefined target in memory: ${task.target}`)
      return;
    }

    // Load object the target references
    const targetObject = Game.getObjectById(task.target);
    if (targetObject == null || targetObject == undefined) {

      // Finished a construction
      if (task.action === HarvesterAction.Build) return;

      console.log(`${this.room}${creep}: Act: ${creep} Game.getObjectById returned null`)
      return;
    }

    var minDistance = 3;
    if (task.action === HarvesterAction.Harvest || task.action === HarvesterAction.Transfer || task.action === HarvesterAction.CollectEnergy)
      minDistance = 1;

    const moveResult = this.MoveCreep(creep, targetObject.pos, minDistance);
    if (moveResult != 1) {
      // console.log(`${this.room}${creep}: Act: Move Resulted in ${moveResult}`)
      return; // There was an issue moving, so skip the act
    }

    var result: number = OK;
    switch (task.action) {
      case (HarvesterAction.Pickup): {
        const t = targetObject as Resource;
        result = creep.pickup(t)
        if (result === OK) console.log(`${this.room}${creep}: Act: Picked up ${t}.`);
        break;
      }
      case (HarvesterAction.CollectEnergy): {
        const t = targetObject as StructureContainer;
        if (t != null) {
          result = creep.withdraw(t, RESOURCE_ENERGY);
          console.log(`${this.room}${creep}: Withdrawing energy... (${t.store.energy}/${t.store.getCapacity(RESOURCE_ENERGY)} -> ${creep.store.energy}/${creep.store.getCapacity(RESOURCE_ENERGY)})`);
        } else {
          // console.log(`${this.room}${creep}: Awaiting energy transfer (${creep.store.energy}/${creep.store.getCapacity(RESOURCE_ENERGY)}).`);
        }
        break;
      }
      case (HarvesterAction.IdleUpgrade):
      case (HarvesterAction.StopDowngrade):
      case (HarvesterAction.Upgrade): {
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
      default: {
        console.log(`${this.room}${creep}: Act: Unknown Action ${task.action}.`);
        return;
      }
    }

    switch (result) {
      case OK:
      case ERR_FULL:
      case ERR_NOT_ENOUGH_RESOURCES: {
        // These are fine, and should be handled by IsActComplete.
        return;
      }
      case ERR_NOT_IN_RANGE: {
        // Move should already be done by this point. If this happens,
        // it's probably because the move didn't leave us fatigued so we tried acting while still too far away.
        console.log(`${this.room}${creep}: Not in range to act ${JSON.stringify(task)}.`);
        return;
      }
      default: {
        console.log(`${this.room}${creep}: Act: ${task.action} for ${creep} was not successful: ${result}`);
        return;
      }
    }
  }

  IsActComplete(creep: Creep, mem: HarvesterMemory): boolean {
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
        if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return true;

        if (targetObject instanceof StructureContainer)
          return targetObject.store.getUsedCapacity(RESOURCE_ENERGY) === 0;
        else
          return creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0;
      case (HarvesterAction.Pickup): {
        if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return true;
        const t = targetObject as Resource;
        return t.amount === 0;
      }
      case (HarvesterAction.IdleUpgrade): {
        return creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0;
      }
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
  BodyParts = [MOVE, MOVE, WORK, WORK, WORK, CARRY, CARRY, CARRY];
  override get CountPerRoom() { return 5; }
}
