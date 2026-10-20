import { CreepExtra } from "Creep";
import { GetRandomName } from "Data";
import { RoomExtra } from "Room";
import { CreepTask, Idle } from "tasks";
import { Logger } from "utils/Logger";
import { Colony } from "Colony";
import { BodyCost } from "utils/CreepUtils";


export interface CreepRole {
  readonly name: string;
  readonly groupName: string;
  readonly tier: number;

  toString(): string;
  TickCreep(creep: CreepExtra): void;

  TickStart(): void; // Called at the start of the tick, before ticking rooms.
  RoomTickStart(room: RoomExtra): void; // Called before ticking the creeps in the room.
  RoomTickEnd(room: RoomExtra): void; // Called after ticking the creeps in the room.
  TickEnd(): void; // Called at the end of the tick, after ticking rooms.

  GetNewCreepName(room: RoomExtra): string; // Return a new name for a newly spawned creep.
  GetNewCreepBody(room: RoomExtra): BodyPartConstant[]; // Return a new body for creeps of this role. See also https://screepspl.us/services/creep-calculator/
  GetInitialTask(room: RoomExtra): CreepTask | null; // Return the initial task to put in the memory of a to-be-spawned creep. Given creep is not accessible yet.
  SelectNextTask(creep: CreepExtra, lastTask: CreepTask | null): CreepTask | null; // Given a creep who just finished a task, find a new task for them.

  GetGlobalQuota(): number;
  GetRoomQuota(room: RoomExtra): number;

  GetGlobalCreepsInRole(): CreepExtra[];  // Get all creeps assigned to this role in the colony
  GetRoomCreepsInRole(room: RoomExtra): CreepExtra[]; // Get all creeps  assigned to this role in the room

  IsSpawnNeeded(room: RoomExtra): boolean;      // Decide if a spawn is needed for a room.
  AttemptSpawn(room: RoomExtra, body: BodyPartConstant[], initialTask: CreepTask | null, newName: string): boolean;       // Attempt to spawn at any spawn in a room. Return true if succeeded.
  AttemptSpawnAt(room: RoomExtra, spawn: StructureSpawn, body: BodyPartConstant[], initialTask: CreepTask, newName: string): boolean; // Attempt to spawn at a specific spawn point.  Return true if succeeded.
  OnSpawnScheduled(room: RoomExtra, name: string): void; // Run after a creep is started spawning.
  OnSpawn(creep: CreepExtra): void; // Run on the first tick after a creep is spawned.
  OnCleanup(room: RoomExtra, creepName: string, creepMemory: CreepMemory): void;
}

export abstract class CreepRoleBase implements CreepRole {
  // Must be supplied by derived roles.
  readonly abstract name: string;
  readonly abstract groupName: string;
  readonly abstract tier: number;
  abstract GetNewCreepBody(_room: RoomExtra): BodyPartConstant[];
  abstract GetGlobalQuota(): number;
  abstract GetRoomQuota(_room: RoomExtra): number;
  abstract IsSpawnNeeded(room: RoomExtra): boolean;

  // Init
  protected readonly log: Logger<CreepRoleBase> = new Logger(this, { formatArgs: { "<role>": this } });
  constructor(protected readonly colony: Colony) { }
  toString(): string { return `[role ${this.name}]`; }

  // Default Implementations
  GetGlobalCreepsInRole(): CreepExtra[] { return this.colony.MyCreeps.filter(c => c.memory.role === this.name); }
  GetInitialTask(room: RoomExtra): CreepTask | null { return null; }
  GetNewCreepName(room: RoomExtra): string { return GetRandomName(); }
  GetRoomCreepsInRole(room: RoomExtra): CreepExtra[] { return room.AssignedCreeps.filter(c => c.memory.role === this.name); }
  OnCleanup(room: RoomExtra, creepName: string, creepMemory: CreepMemory): void { }
  OnSpawn(creep: CreepExtra): void { }
  OnSpawnScheduled(room: RoomExtra, name: string): void { }
  RoomTickEnd(room: RoomExtra): void { }
  RoomTickStart(room: RoomExtra): void { }
  SelectNextTask(_creep: CreepExtra, _lastTask: CreepTask): CreepTask | null { return null; }
  TickCreep(creep: CreepExtra): void { }
  TickEnd(): void { }
  TickStart(): void { }

  AttemptSpawn(
    room: RoomExtra,
    body: BodyPartConstant[],
    initialTask: CreepTask,
    newName: string,
  ): boolean {
    const cost = BodyCost(body);
    if (room.energyAvailable < cost) {
      if (Game.time % 10 === 0) this.log.info(`Room lacks the energy to spawn need ${cost} have ${room.energyAvailable}/${room.energyCapacityAvailable}`, { "<room>": room });
      return false; // No point proceeding
    }

    for (const sp of room.AvailableSpawns)
      if (this.AttemptSpawnAt(room, sp, body, initialTask, newName)) return true;
    return false;
  }

  AttemptSpawnAt(
    room: RoomExtra,
    spawn: StructureSpawn,
    body: BodyPartConstant[],
    initialTask: CreepTask,
    name: string
  ): boolean {
    // Get directions to surrounding roads
    const nearbyRoads = spawn.pos.findInRange(room.Roads, 1)
      .map(nr => spawn.pos.getDirectionTo(nr.pos.x, nr.pos.y));

    // Try to do the spawn
    const result = spawn.spawnCreep(body, name, {
      directions: nearbyRoads.length > 0 ? nearbyRoads : undefined,
      memory: {
        room: room.name,
        role: this.name,
        stuckTicks: 0,
        lastPos: { x: spawn.pos.x, y: spawn.pos.y, room: room.name },
        jobMemory: initialTask,
        _spawning: true,
      },
    });

    const cost = BodyCost(body);

    // Log the result
    if (result === OK) {
      this.log.info(`Spawning ${name} ${cost} @ ${spawn}...`, { "<room>": room });
      return true;
    } else {
      this.log.info(`Attempt to spawn ${name} ${cost} at ${spawn} resulted in: ${result}...`, { "<room>": room });
      return false;
    }
  }
}
