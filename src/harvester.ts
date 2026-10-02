import { Role } from "role";


enum WorkerAction {
  Idle = '💤',
  Mine = '⛏️',
  CollectEnergy = '🔌',
  MaintainController = '🦸‍♀️',
  Build = '🏗️',
  Repair = '🛠️',
  Transfer = '🫴',
  UpgradeController = '🔼',
  Pickup = "🧹"
}

class WorkerTask extends Object {
  readonly action: WorkerAction;
  readonly target: Id<ConstructionSite<BuildableStructureConstant> | AnyOwnedStructure | Source | Creep | Resource<RESOURCE_ENERGY> | StructureContainer> | null;

  constructor(action: WorkerAction, id: Id<ConstructionSite<BuildableStructureConstant> | AnyOwnedStructure | Source | Creep | Resource<RESOURCE_ENERGY> | StructureContainer> | null = null) {
    super();

    if (id == null && action !== WorkerAction.Idle) {
      throw new Error(`Id was null with a non idle action: ${action}`);
    }

    this.action = action;
    this.target = id;
  }
}

export class WorkerI extends Role<WorkerTask> {
  RoleName = "harvester";
  InitialJobMemory = new WorkerTask(WorkerAction.Idle);

  StartSpawnAtRCL = 0;
  StopSpawnAtRCL = 4;
  BodyParts = [WORK, CARRY, MOVE];

  get CountPerRoom() {
    const max = 4;
    const T2 = Object.values(Game.creeps).filter(c => c.memory.room === this.room.name && c.memory.role === 'harvesterT2').length;
    return max - T2 <= 0 ? 0 : max - T2;
  }

  ControllerMaintenanceThreshold = 5000; // Start upgrading when ticksToDowngrade is less than this.
  ControllerMaintenanceBuffer = 5000;    // Stop upgrading when ticksToDowngrade is greater than `ControllerMaintenanceThreshold+ControllerMaintenanceBuffer`.

  MaxMaintenanceWorkers = 2;

  MediumSearchRange = 20;
  ShortSearchRange = 5;

  // Main creep control loop
  TickCreep(creep: Creep, currentTask: WorkerTask): void {
    if (this.IsTaskComplete(creep, currentTask)) {
      const newTask = this.Reassign(creep);
      console.log(`${this.room}${creep} Reassigned: ${JSON.stringify(currentTask)} -> ${JSON.stringify(newTask)}`);
      creep.say(newTask.action);
      creep.memory.jobMemory = newTask;
    }
    this.Act(creep, currentTask);
  }

  Reassign(creep: Creep): WorkerTask {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0)
      return this.FindGatheringTask(creep);
    else
      return this.FindSpendingTask(creep);
  }

  FindSpendingTask(creep: Creep): WorkerTask {
    // Select target in order of priority

    // Spawns/Extensions with room for energy
    const spawnOrExtension = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
      filter: (structure) =>
        (structure.structureType === STRUCTURE_EXTENSION || structure.structureType === STRUCTURE_SPAWN)
        && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    });
    if (
      spawnOrExtension instanceof StructureSpawn
      || spawnOrExtension instanceof StructureExtension
    ) return new WorkerTask(WorkerAction.Transfer, spawnOrExtension.id);

    // Controller at risk of downgrade
    if (
      this.room.controller?.my
      && this.room.controller.ticksToDowngrade < this.ControllerMaintenanceThreshold
      && this.CreepsInRole().filter(c => (c.memory.jobMemory as WorkerTask).action === WorkerAction.MaintainController).length < this.MaxMaintenanceWorkers
    ) return new WorkerTask(WorkerAction.MaintainController, this.room.controller.id);

    // Towers with room for energy
    const tower = creep.pos.findClosestByPath(FIND_MY_STRUCTURES,
      {
        filter: (s) => s.structureType === STRUCTURE_TOWER && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
        ignoreCreeps: true
      });
    if (tower instanceof StructureTower) return new WorkerTask(WorkerAction.Transfer, tower.id);

    // Ongoing Construction
    const construction = creep.pos.findClosestByPath(FIND_MY_CONSTRUCTION_SITES, { ignoreCreeps: true });
    if (construction instanceof ConstructionSite) return new WorkerTask(WorkerAction.Build, construction.id);

    // Structures in need of repair
    const delapitated = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, { filter: (s) => s.hits < s.hitsMax, ignoreCreeps: true });
    if (delapitated instanceof Structure) return new WorkerTask(WorkerAction.Repair, delapitated.id);

    // Nothing else to do so just upgrade forever
    if (this.room.controller?.my) return new WorkerTask(WorkerAction.UpgradeController, this.room.controller.id);

    // Default
    return new WorkerTask(WorkerAction.Idle);
  }

  FindGatheringTask(creep: Creep): WorkerTask {
    // Dropped Energy with reasonable amount remaining
    const dropped = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, { filter: r => r.resourceType === RESOURCE_ENERGY && r.amount > 30 });
    if (dropped instanceof Resource) return new WorkerTask(WorkerAction.Pickup, dropped.id as Id<Resource<RESOURCE_ENERGY>>);

    // Collect from the nearest container that has energy
    const container = creep.pos.findClosestByPath(FIND_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.store.energy > 0 });
    if (container instanceof StructureContainer)
      return new WorkerTask(WorkerAction.CollectEnergy, container.id);

    // Collect from the fullest miner nearby if there are any
    const miner = creep.pos.findInRange(FIND_MY_CREEPS, this.MediumSearchRange, { filter: (c) => c.memory.role === "Miner" && c.store.energy > 0 })
      .sort((a, b) => a.store.energy - b.store.energy).pop()
    if (miner != null && miner != undefined) return new WorkerTask(WorkerAction.CollectEnergy, miner.id);

    // Do harvesting on our own
    const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
    if (source) return new WorkerTask(WorkerAction.Mine, source.id);

    // Nothing to do without energy
    return new WorkerTask(WorkerAction.Idle);
  }

  Act(creep: Creep, task: WorkerTask): void {
    // Validate Target
    if (task.target == null || task.target == undefined) {
      // Target may be null in this one case
      if (task.action === WorkerAction.Idle) return;

      console.log(`${this.room}${creep}: Act: ${creep} has null/undefined target in memory: ${task.target}`)
      return;
    }

    // Load object the target references
    const targetObject = Game.getObjectById(task.target);
    if (targetObject == null || targetObject == undefined) {

      // Finished a construction
      if (task.action === WorkerAction.Build) return;

      console.log(`${this.room}${creep}: Act: ${creep} Game.getObjectById returned null`)
      return;
    }

    // Actually act on the target
    var result: number = OK;
    switch (task.action) {
      case (WorkerAction.Pickup): {
        const t = targetObject as Resource;
        result = creep.pickup(t)
        if (result === OK) console.log(`${this.room}${creep}: Act: Picked up ${t}.`);
        break;
      }
      case (WorkerAction.CollectEnergy): {
        if (targetObject instanceof StructureContainer || targetObject instanceof Tombstone || targetObject instanceof Ruin) {
          result = creep.withdraw(targetObject, RESOURCE_ENERGY);
          // console.log(`${this.room}${creep}: Withdrawing energy... (${t.store.energy}/${t.store.getCapacity(RESOURCE_ENERGY)} -> ${creep.store.energy}/${creep.store.getCapacity(RESOURCE_ENERGY)})`);
        } else if (targetObject instanceof Creep) {
          // console.log(`${this.room}${creep}: Awaiting energy transfer (${creep.store.energy}/${creep.store.getCapacity(RESOURCE_ENERGY)}).`);
        } else {
          console.log(`${this.room}${creep}: Unknown target for CollectEnergy: ${targetObject}`);
        }
        break;
      }
      case (WorkerAction.UpgradeController):
      case (WorkerAction.MaintainController): {
        const t = targetObject as StructureController;
        result = creep.upgradeController(t);
        // if (result === OK) console.log(`${this.room}${creep}: Act: Upgraded ${t} to RCL ${t.level} (${t.progress}/${t.progressTotal}) %${(t.progress / t.progressTotal * 100).toFixed(2)}.`);
        break;
      }
      case (WorkerAction.Build): {
        const t = targetObject as ConstructionSite;
        result = creep.build(t);
        // if (result === OK) console.log(`${this.room}${creep}: Act: Built ${t} (${t.progress}/${t.progressTotal}) %${(t.progress / t.progressTotal * 100).toFixed(2)}.`);
        break;
      }
      case (WorkerAction.Repair): {
        const t = targetObject as AnyOwnedStructure;
        result = creep.repair(t);
        // if (result === OK) console.log(`${this.room}${creep}: Act: Repaired ${t} (${t.hits}/${t.hitsMax}) %${(t.hits / t.hitsMax * 100).toFixed(2)}.`);
        break;
      }
      case (WorkerAction.Transfer): {
        const t = targetObject as AnyStoreStructure;
        result = creep.transfer(t, RESOURCE_ENERGY);
        // if (result === OK) console.log(`${this.room}${creep}: Act: Supplied ${t}.`);
        break;
      }
      case (WorkerAction.Mine): {
        const t = targetObject as Source;
        result = creep.harvest(t)
        // if (result === OK) console.log(`${this.room}${creep}: Act: Mined ${t}.`);
        break;
      }
      default: {
        console.log(`${this.room}${creep}: Act: Unknown Action ${JSON.stringify(task)}.`);
        break;
      }
    }

    // Handle errors

    switch (result) {
      case OK:
      case ERR_FULL:
      case ERR_NOT_ENOUGH_RESOURCES: {
        // These can be ignored.
        return;
      }
      case ERR_NOT_IN_RANGE: {
        // Determine how close we need to move to the target
        var minDistance = 3;
        if (
          task.action === WorkerAction.Mine
          || task.action === WorkerAction.Transfer
          || task.action === WorkerAction.CollectEnergy
        )
          minDistance = 1;
        else if (task.action === WorkerAction.Pickup)
          minDistance = 0;

        // Move until in `minDistance` of target
        this.MoveCreep(creep, targetObject.pos, minDistance);
        return;
      }
      default: {
        // Generic print all
        console.log(`${this.room}${creep}: Act: Task ${JSON.stringify(task)} was not successful: ${result}`);
        return;
      }
    }
  }

  IsTaskComplete(creep: Creep, task: WorkerTask): boolean {
    // Invalid/Idle tasks are always done.
    if (!task.target || !task.action || task.action === WorkerAction.Idle) return true;

    // Get the object the task references
    const targetObject = Game.getObjectById(task.target);
    if (!targetObject && task.action === WorkerAction.Build)
      return true; // Builders can have stale objects so don't log an error
    else if (!targetObject) {
      console.log(`${this.room}${creep}: IsTaskComplete: Game.getObjectById of ${task.target} is null`);
      return true;
    }

    switch (task.action) {
      case (WorkerAction.Mine):
      case (WorkerAction.CollectEnergy): {
        if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return true;
        if (targetObject instanceof StructureContainer && targetObject.store.energy === 0) return true;
        return false;
      }
      case (WorkerAction.Pickup): {
        if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return true;
        const t = targetObject as Resource<RESOURCE_ENERGY>;
        return t.amount === 0;
      }
      case (WorkerAction.UpgradeController): {
        return creep.store.energy === 0;
      }
      case (WorkerAction.MaintainController): {
        if (creep.store.energy === 0) return true;
        return this.room.controller!.ticksToDowngrade > (this.ControllerMaintenanceThreshold + this.ControllerMaintenanceBuffer)
      }
      case (WorkerAction.Build): {
        if (creep.store.energy === 0) return true;
        const t = targetObject as ConstructionSite;
        return t.progress === t.progressTotal;
      }
      case (WorkerAction.Repair): {
        if (creep.store.energy === 0) return true;
        const t = targetObject as AnyOwnedStructure;
        return t.hits === t.hitsMax;
      }
      case (WorkerAction.Transfer): {
        if (creep.store.energy === 0) return true;
        const t = targetObject as AnyStoreStructure;
        return t.store.getFreeCapacity(RESOURCE_ENERGY) === 0;
      }
      default: {
        console.log(`${this.room}${creep}: IsTaskComplete: Unknown Task is complete: ${JSON.stringify(task)}`);
        return true;
      }
    }
  }
}

export class WorkerII extends WorkerI {
  RoleName = "harvesterT2";

  StartSpawnAtRCL = 2;
  StopSpawnAtRCL = 100;
  BodyParts = [MOVE, MOVE, WORK, WORK, WORK, CARRY, CARRY, CARRY];
  override get CountPerRoom() { return 5; }
}
