import { CreepExtra } from "Creep";
import { RoomRole } from "./Role";

enum WorkerAction {
  Idle = '💤',
  Mine = '⛏️',
  CollectEnergy = '🔌',
  MaintainController = '🦸‍♀️',
  Build = '🏗️',
  Repair = '🛠️',
  Supply = '🫴',
  UpgradeController = '🔼',
  Pickup = "🧹"
}

type WorkerTarget = Id<ConstructionSite<BuildableStructureConstant> | AnyStructure | Source | Creep | Resource<RESOURCE_ENERGY> | StructureContainer>

class WorkerTask extends Object {
  readonly action: WorkerAction;
  readonly target: WorkerTarget | null;

  constructor(action: WorkerAction, id?: WorkerTarget) {
    super();

    this.action = action;
    this.target = id ? id : null;
    if ((!id) && action !== WorkerAction.Idle) {
      throw new Error(`Id was ${id} with a non idle action: ${action}`);
    }
  }

  equals(other: WorkerTask) {
    return this.action === other.action && this.target == other.target;
  }
}

export class WorkerI extends RoomRole<WorkerTask> {
  static readonly RoleName: string = "WorkerI";
  InitialJobMemory = new WorkerTask(WorkerAction.Idle);

  StartSpawnAtRCL = 0;
  StopSpawnAtRCL = 4;
  BodyParts = [WORK, CARRY, MOVE];

  get CountPerRoom() {
    const max = 6;
    const T2 = Object.values(Game.creeps).filter(c => c.memory.room === this.manager.name && c.memory.role === 'WorkerII').length;
    return max - T2 <= 0 ? 0 : max - T2;
  }

  ControllerMaintenanceThreshold = 5000; // Start upgrading when ticksToDowngrade is less than this.
  ControllerMaintenanceBuffer = 5000;    // Stop upgrading when ticksToDowngrade is greater than `ControllerMaintenanceThreshold+ControllerMaintenanceBuffer`.

  get MaxSupplyWorkers() { return this.manager.SpawnsOrExtensions.length; }
  MaxMaintenanceWorkers = 2;
  MaxConstructionWorkers = 3;

  MediumSearchRange = 20;
  ShortSearchRange = 5;

  // Main creep control loop
  TickCreep(creep: CreepExtra, currentTask: WorkerTask): void {
    if (this.IsTaskComplete(creep, currentTask)) {
      const newTask = this.Reassign(creep);
      console.log(`[${this.manager.name}]${creep} Reassigned: ${JSON.stringify(currentTask)} -> ${JSON.stringify(newTask)}`);
      creep.say(newTask.action);
      creep.memory.jobMemory = newTask;
    }
    this.Act(creep, currentTask);
  }

  Reassign(creep: CreepExtra): WorkerTask {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0)
      return this.FindGatheringTask(creep);
    else if (this.manager.HostileCreeps.length > 0)
      return this.FindWartimeSpendingTask(creep);
    else
      return this.FindSpendingTask(creep);
  }

  ControllerMaintenanceTask?: WorkerTask = this.manager.controller?.my == true
    ? new WorkerTask(WorkerAction.MaintainController, this.manager.controller.id)
    : undefined;

  ControllerUpgradeTask?: WorkerTask = this.manager.controller?.my == true
    ? new WorkerTask(WorkerAction.UpgradeController, this.manager.controller.id)
    : undefined;

  private _CurrentlyAssignedTasks?: WorkerTask[];
  get CurrentlyAssignedTasks(): WorkerTask[] {
    if (!this._CurrentlyAssignedTasks) this._CurrentlyAssignedTasks = this.CreepsInRoomAndRole
      .filter(c => c.memory.jobMemory as WorkerTask)
      .map(c => c.memory.jobMemory as WorkerTask);
    return this._CurrentlyAssignedTasks;
  }

  FindWartimeSpendingTask(creep: CreepExtra): WorkerTask {
    // Spawns/Extensions/Towers with room for energy
    const structureNeedingEnergy = this.FindSuitableNeedsSupply(creep.pos);
    if (structureNeedingEnergy) return new WorkerTask(WorkerAction.Supply, structureNeedingEnergy.id);

    // Ongoing Construction
    const site = this.FindSuitableConstruction(creep.pos);
    if (site) return new WorkerTask(WorkerAction.Build, site.id);

    // Structures in need of repair
    const delapitated = this.FindSuitableRepair(creep.pos)
    if (delapitated) return new WorkerTask(WorkerAction.Repair, delapitated.id);

    // Default
    return new WorkerTask(WorkerAction.Idle);
  }

  FindSpendingTask(creep: CreepExtra): WorkerTask {
    // Select target in order of priority

    // Spawns/Extensions/Towers with room for energy
    const currentTransferTasks = this.CurrentlyAssignedTasks
      .filter(t => t.action === WorkerAction.Supply);
    if (currentTransferTasks.length < this.MaxSupplyWorkers) {
      const structureNeedingEnergy = this.FindSuitableNeedsSupply(creep.pos);
      if (structureNeedingEnergy)
        return new WorkerTask(WorkerAction.Supply, structureNeedingEnergy.id);
    }

    // Controller at risk of downgrade
    const currentMaintenanceTasks = this.CurrentlyAssignedTasks.filter(t => t.action === WorkerAction.MaintainController);
    if (
      this.ControllerMaintenanceTask
      && currentMaintenanceTasks.length < this.MaxMaintenanceWorkers
      && this.manager.controller!.ticksToDowngrade < this.ControllerMaintenanceThreshold
    ) return this.ControllerMaintenanceTask;

    // Ongoing Construction
    const currentConstructionTasks = this.CurrentlyAssignedTasks
      .filter(t => t.action === WorkerAction.Build);
    if (currentConstructionTasks.length < this.MaxConstructionWorkers) {
      const site = this.FindSuitableConstruction(creep.pos);
      if (site) return new WorkerTask(WorkerAction.Build, site.id);
    }

    // Structures in need of repair
    const delapitated = this.FindSuitableRepair(creep.pos)
    if (delapitated) return new WorkerTask(WorkerAction.Repair, delapitated.id);

    // Nothing else to do so just upgrade forever
    if (this.ControllerUpgradeTask) return this.ControllerUpgradeTask;

    // Default
    return new WorkerTask(WorkerAction.Idle);
  }

  FindGatheringTask(creep: CreepExtra): WorkerTask {
    // Dropped Energy with reasonable amount remaining
    const dropped = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, { filter: r => r.resourceType === RESOURCE_ENERGY && r.amount > 30 });
    if (dropped) return new WorkerTask(WorkerAction.Pickup, dropped.id as Id<Resource<RESOURCE_ENERGY>>);

    // Collect from the nearest container that has energy
    const container = creep.pos.findClosestByPath(this.manager.Containers.filter(s => s.store.getUsedCapacity(RESOURCE_ENERGY)), { ignoreCreeps: true });
    if (container) return new WorkerTask(WorkerAction.CollectEnergy, container.id);

    // Collect from the fullest miner in medium range
    const miners = creep.pos.findInRange(
      (this.manager.CreepsByRole.get("Miner") ?? []).filter(m => m.store.getUsedCapacity(RESOURCE_ENERGY)),
      this.MediumSearchRange
    ).sort((a, b) => a.store.energy - b.store.energy).pop();
    if (miners) return new WorkerTask(WorkerAction.CollectEnergy, miners.id);

    // Do harvesting on our own
    const source = this.FindSuitableSource();
    if (source) return new WorkerTask(WorkerAction.Mine, source);

    // Nothing to do without energy
    return new WorkerTask(WorkerAction.Idle);
  }

  FindSuitableConstruction(pos: RoomPosition): ConstructionSite | null {
    return pos.findClosestByPath(this.manager.ConstructionSites, { ignoreCreeps: true });
  }

  FindSuitableNeedsSupply(pos: RoomPosition): AnyStoreStructure | undefined {
    // Get all transfers in progress
    const currentTransferTasks = this.CurrentlyAssignedTasks
      .filter(t => t.action === WorkerAction.Supply);

    // Group by target and return count of group
    const storesByCount = new Map<Id<AnyStoreStructure>, number>();
    for (const t of currentTransferTasks)
      storesByCount.set(
        t.target as Id<AnyStoreStructure>,
        (storesByCount.get(t.target as Id<AnyStoreStructure>) ?? 0) + 1
      );

    // Return the Spawn/Extension/Tower with room for energy
    // and the least number of other assigned transfers
    return [...this.manager.SpawnsOrExtensions, ...this.manager.Towers]
      .filter(s => s.store.getFreeCapacity(RESOURCE_ENERGY))
      .map(s => ({ store: s, transferCount: storesByCount.get(s.id) ?? 0 }))
      .sort((b, a) => a.transferCount - b.transferCount)
      .pop()?.store;
  }

  FindSuitableRepair(pos: RoomPosition): AnyStructure | null {
    return pos.findClosestByPath(
      this.manager.MyStructures
        .filter(s => s.hits < s.hitsMax),
      { ignoreCreeps: true });
  }

  FindSuitableSource(): Id<Source> | undefined {
    const harvestersBySource = new Map<Id<Source>, number>();
    for (const c of [
      ...this.manager.CreepsByRole.get("WorkerI") ?? [],
      ...this.manager.CreepsByRole.get("WorkerII") ?? [],
    ]) {
      const mem = c.memory.jobMemory as WorkerTask;
      if (!mem.target) continue;
      const obj = Game.getObjectById(mem.target);
      if (obj instanceof Source) harvestersBySource.set(obj.id, (harvestersBySource.get(obj.id) ?? 0) + 1)
    }
    return this.manager.Sources
      .map(source => ({ source, count: harvestersBySource.get(source.id) ?? 0 }))
      .sort((b, a) => a.count - b.count)
      .pop()?.source.id;
  }

  Act(creep: CreepExtra, task: WorkerTask): void {
    // Validate Target
    if (task.target == null || task.target == undefined) {
      // Target may be null in this one case
      if (task.action === WorkerAction.Idle) return;

      console.log(`[${this.manager.name}]${creep}: Act: ${creep} has null/undefined target in memory: ${task.target}`)
      return;
    }

    // Load object the target references
    const targetObject = Game.getObjectById(task.target);
    if (targetObject == null || targetObject == undefined) {

      // Finished a construction
      if (task.action === WorkerAction.Build) return;

      console.log(`[${this.manager.name}]${creep}: Act: ${creep} Game.getObjectById returned null`)
      return;
    }

    // Actually act on the target
    var result: number = OK;
    switch (task.action) {
      case (WorkerAction.Pickup): {
        const t = targetObject as Resource;
        result = creep.pickup(t)
        if (result === OK) console.log(`[${this.manager.name}]${creep}: Act: Picked up ${t}.`);
        break;
      }
      case (WorkerAction.CollectEnergy): {
        if (targetObject instanceof StructureContainer || targetObject instanceof Tombstone || targetObject instanceof Ruin) {
          result = creep.withdraw(targetObject, RESOURCE_ENERGY);
          // console.log(`[${this.manager.name}]${creep}: Withdrawing energy... (${t.store.energy}/${t.store.getCapacity(RESOURCE_ENERGY)} -> ${creep.store.energy}/${creep.store.getCapacity(RESOURCE_ENERGY)})`);
        } else if (targetObject instanceof Creep) {
          // console.log(`[${this.manager.name}]${creep}: Awaiting energy transfer (${creep.store.energy}/${creep.store.getCapacity(RESOURCE_ENERGY)}).`);
          result = ERR_NOT_IN_RANGE; // Forces them to move toward the Miner.
        } else {
          console.log(`[${this.manager.name}]${creep}: Unknown target for CollectEnergy: ${targetObject}`);
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
      case (WorkerAction.Supply): {
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
        console.log(`[${this.manager.name}]${creep}: Act: Unknown Action ${JSON.stringify(task)}.`);
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
          || task.action === WorkerAction.Supply
          || task.action === WorkerAction.CollectEnergy
        )
          minDistance = 1;
        else if (task.action === WorkerAction.Pickup)
          minDistance = 0;

        // Move. Since this is our last action, ignore the RC.
        creep.MoveCreep(targetObject.pos, { range: minDistance });
        return;
      }
      default: {
        // Generic print all
        console.log(`[${this.manager.name}]${creep}: Act: Task ${JSON.stringify(task)} was not successful: ${result}`);
        return;
      }
    }
  }

  IsTaskComplete(creep: CreepExtra, task: WorkerTask): boolean {
    // Invalid/Idle tasks are always done.
    if (!task.target || !task.action || task.action === WorkerAction.Idle) return true;

    // Get the object the task references
    const targetObject = Game.getObjectById(task.target);
    if (!targetObject && task.action === WorkerAction.Build)
      return true; // Builders can have stale objects so don't log an error
    else if (!targetObject) {
      console.log(`[${this.manager.name}]${creep}: IsTaskComplete: Game.getObjectById of ${task.target} is null`);
      return true;
    }

    switch (task.action) {
      case (WorkerAction.Mine): {
        if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return true;
        return (targetObject as Source).energy === 0;
      }
      case (WorkerAction.CollectEnergy): {
        if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return true;
        if (targetObject instanceof StructureContainer) return targetObject.store.energy === 0;
        if (targetObject instanceof Creep) return targetObject.store.energy === 0;
        if (targetObject instanceof Resource && targetObject.resourceType === RESOURCE_ENERGY) return targetObject.amount > 0;

        console.log(`[${this.manager.name}]${creep}: Assuming collection is complete: ${targetObject}`);
        return true;
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
        return this.manager.controller!.ticksToDowngrade > (this.ControllerMaintenanceThreshold + this.ControllerMaintenanceBuffer)
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
      case (WorkerAction.Supply): {
        if (creep.store.energy === 0) return true;
        const t = targetObject as AnyStoreStructure;
        return t.store.getFreeCapacity(RESOURCE_ENERGY) === 0;
      }
      default: {
        console.log(`[${this.manager.name}]${creep}: IsTaskComplete: Unknown Task is complete: ${JSON.stringify(task)}`);
        return true;
      }
    }
  }
}

export class WorkerII extends WorkerI {
  static override readonly RoleName: string = "WorkerII";

  StartSpawnAtRCL = 2;
  StopSpawnAtRCL = 100;
  BodyParts = [MOVE, MOVE, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY];
  override get CountPerRoom() { return 10; }
}
