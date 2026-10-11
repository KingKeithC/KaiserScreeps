import { CreepExtra } from "Creep";
import { Adjectives, GetRandomSuffix, Nouns } from "Data";
import { RoomExtra } from "Room";
import { CreepTask, Idle } from "Tasks";
import { Logger } from "utils/Logger";
import { Colony } from "Colony";


export interface CreepRole {
  readonly name: string;
  readonly groupName: string;
  readonly tier: number;

  SpawnRate: number;
  SpawnTickOffet: number;

  toString(): string;
  TickCreep(creep: CreepExtra, room: RoomExtra): void;

  TickStart(): void; // Called at the start of the tick, before ticking rooms.
  RoomTickStart(room: RoomExtra): void; // Called before ticking the creeps in the room.
  RoomTickEnd(room: RoomExtra): void; // Called after ticking the creeps in the room.
  TickEnd(): void; // Called at the end of the tick, after ticking rooms.

  GetNewCreepName(room: RoomExtra): string; // Return a new name for a newly spawned creep.
  GetNewCreepBody(room: RoomExtra): BodyPartConstant[]; // Return a new body for creeps of this role.
  GetInitialTask(room: RoomExtra): CreepTask; // Return the initial task to put in the memory of a to-be-spawned creep. Given creep is not accessible yet.
  SelectNextTask(creep: CreepExtra, room: RoomExtra): CreepTask; // Given a creep who just finished a task, find a new task for them.

  GetGlobalQuota(): number;
  GetRoomQuota(room: RoomExtra): number;

  GetGlobalCreepsInRole(): CreepExtra[];  // Get all creeps assigned to this role in the colony
  GetRoomCreepsInRole(room: RoomExtra): CreepExtra[]; // Get all creeps  assigned to this role in the room

  IsEnabledFor(room: RoomExtra): boolean; // Decide if a role should even be spawned.
  IsSpawnNeeded(room: RoomExtra): boolean;      // Decide if a spawn is needed for a room.
  AttemptSpawn(room: RoomExtra, body: BodyPartConstant[], initialTask?: CreepTask): boolean;       // Attempt to spawn at any spawn in a room. Return true if succeeded.
  AttemptSpawnAt(room: RoomExtra, spawn: StructureSpawn, body: BodyPartConstant[], initialTask?: CreepTask): boolean; // Attempt to spawn at a specific spawn point.  Return true if succeeded.
}

export abstract class CreepRoleBase implements CreepRole {
  readonly abstract name: string;
  readonly abstract groupName: string;
  readonly abstract tier: number;

  abstract GetNewCreepBody(_room: RoomExtra): BodyPartConstant[];
  abstract SelectNextTask(creep: CreepExtra, room: RoomExtra): CreepTask;

  protected readonly log: Logger<CreepRoleBase> = new Logger(this, { formatArgs: { "<role>": this } });

  constructor(private readonly colony: Colony) { }

  toString(): string { return `[role ${this.name}]`; }
  TickStart(): void { }
  RoomTickStart(room: RoomExtra): void { }
  RoomTickEnd(room: RoomExtra): void { }
  TickEnd(): void { }
  GetInitialTask(_room: RoomExtra): CreepTask { return new Idle(); }
  GetNewCreepName(_room: RoomExtra): string { return GetRandomSuffix(); }
  GetGlobalQuota(): number { return -1; }
  GetRoomQuota(_room: RoomExtra): number { return 0; }
  GetGlobalCreepsInRole(): CreepExtra[] { return this.colony.MyCreeps.filter(c => c.memory.role === this.name); }
  GetRoomCreepsInRole(room: RoomExtra): CreepExtra[] { return room.AssignedCreeps.filter(c => c.memory.role === this.name); }
  TickCreep(creep: CreepExtra, room: RoomExtra): void { }

  IsEnabledFor(room: RoomExtra): boolean {
    // room.controller
    const controller = room.controller;
    if (!controller) {
      this.log.warn(`The room has no accessible controller.`, { "<room>": room });
      return false;
    };

    // Cannot spawn if we don't own the controller
    if (!controller.my) {
      this.log.warn(`We don't control the room.`, { "<room>": room });
      return false;
    };

    // Cannot spawn if RCL is wrong
    if (!controller.level || controller.level < this.StartSpawnAtRCL || controller.level >= this.StopSpawnAtRCL) {
      this.log.verbose(`RCL (${controller.level}) is outside spawn requirements (${this.StartSpawnAtRCL} <= RCL < ${this.StopSpawnAtRCL})`, { "<room>": room });
      return false;
    };

    // Or room has no spawns
    if (room.AvailableSpawns.length === 0) {
      this.log.debug(`Room has no available spawn points.`);
      return false;
    }

    this.log.debug(`Role is enabled for spawns.`);
    return true;
  }

  StartSpawnAtRCL: number = 1; // Min for owned room is 1
  StopSpawnAtRCL: number = 9; // Max for owned room is 8
  SpawnRate: number = 100;
  SpawnTickOffet: number = 0;
  IsSpawnNeeded(room: RoomExtra): boolean {
    const globalCount = this.GetGlobalCreepsInRole().length;
    const globalQuota = this.GetGlobalQuota();
    if (globalQuota === 0 || (globalQuota !== -1 && globalCount >= globalQuota)) {
      this.log.debug(`Global quota satisfied: ${globalCount}/${globalQuota}`, { "<room>": room });
      return false;
    } else {
      this.log.debug(`Global quota is unmet: ${globalCount}/${globalQuota}`, { "<room>": room });
    }

    const roomCount = this.GetRoomCreepsInRole(room).length;
    const roomQuota = room.Quota(this.name);
    if (roomQuota === 0 || (roomQuota !== -1 && roomCount >= roomQuota)) {
      this.log.debug(`Room quota satisfied: ${roomCount}/${roomQuota}`, { "<room>": room });
      return false;
    } else {
      this.log.debug(`Room quota is unmet: ${roomCount}/${roomQuota}`, { "<room>": room });
    }

    // Spawn is needed if it's been too long.
    const lastSpawn = room.LastSpawnTick(this.name);
    const timeSinceLastSpawn = Game.time - lastSpawn - this.SpawnTickOffet;
    this.log.debug(`TimeSinceLastSpawn is: ${timeSinceLastSpawn}, warrants spawn: ${timeSinceLastSpawn > this.SpawnRate}`, { "<room>": room });
    return timeSinceLastSpawn > this.SpawnRate;
  }

  // Attempt to spawn at any point in a room
  AttemptSpawn(room: RoomExtra, body: BodyPartConstant[], initialTask?: CreepTask, newName?: string): boolean {
    if (room.energyAvailable < CreepExtra.BodyCost(body)) return false; // No point proceeding

    for (const sp of room.AvailableSpawns)
      if (this.AttemptSpawnAt(room, sp, body, initialTask, newName)) return true;
    return false;
  }

  // Attempt to spawn at a specific spawn point
  AttemptSpawnAt(room: RoomExtra, spawn: StructureSpawn, body: BodyPartConstant[], initialTask?: CreepTask, newName?: string): boolean {
    const name = newName ?? `${this.name}-${this.GetNewCreepName(room)}`;
    const task = initialTask ?? this.GetInitialTask(room);

    // Try to do the spawn
    const result = spawn.spawnCreep(body, name, {
      memory: {
        room: room.name,
        role: this.name,
        stuckTicks: 0,
        lastPos: { x: spawn.pos.x, y: spawn.pos.y },
        jobMemory: task,
      },
    });

    // Log the result
    if (result === OK) {
      this.log.info(`Spawning ${name} @ ${spawn}...`);
      return true; // Successful, no need to proceed.
      // } else if (result === ERR_NOT_ENOUGH_ENERGY) {
      //   return false; // Just ignore
    } else {
      this.log.info(`Attempt to spawn ${name} at ${spawn} resulted in: ${result}...`);
      return false;
    }
  }
}
