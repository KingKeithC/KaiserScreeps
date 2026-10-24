/* eslint-disable @typescript-eslint/no-unused-vars */
import { Colony } from "Colony";
import { CreepExtra } from "Creep";
import { GetRandomName } from "Data";
import { RoomExtra } from "Room";
import { CreepTask } from "tasks";
import { BodyCost } from "utils/CreepUtils";
import { Logger } from "utils/Logger";


export interface CreepRole {
  readonly name: string;
  readonly groupName: string;

  toString(): string;
  TickCreep(creep: CreepExtra): void;

  StartOfTick(): void; // Called at the start of the tick, before ticking rooms.
  RoomTickStart(room: RoomExtra): void; // Called before ticking the creeps in the room.
  RoomTickEnd(room: RoomExtra): void; // Called after ticking the creeps in the room.
  EndOfTick(): void; // Called at the end of the tick, after ticking rooms.

  GetNewCreepName(room: RoomExtra): string; // Return a new name for a newly spawned creep.
  GetNewCreepBody(room: RoomExtra): BodyPartConstant[]; // Return a new body for creeps of this role. See also https://screepspl.us/services/creep-calculator/
  SelectNextTask(creep: CreepExtra): CreepTask | null; // Given a creep who just finished a task, find a new task for them.

  GetRoomQuota(room: RoomExtra): number;

  GetGlobalCreepsInRole(): CreepExtra[];  // Get all creeps assigned to this role in the colony
  GetRoomCreepsInRole(room: RoomExtra): CreepExtra[]; // Get all creeps  assigned to this role in the room

  IsSpawnNeeded(room: RoomExtra): boolean;      // Decide if a spawn is needed for a room.
  OnSpawnScheduled(room: RoomExtra, name: string): void; // Run after a creep is started spawning.
  OnSpawn(creep: CreepExtra): void; // Run on the first tick after a creep is spawned.
  OnCleanup(room: RoomExtra, creepName: string, creepMemory: CreepMemory): void;
}

export abstract class CreepRoleBase implements CreepRole {
  // Must be supplied by derived roles.
  readonly abstract name: string;
  readonly abstract groupName: string;
  abstract GetNewCreepBody(room: RoomExtra): BodyPartConstant[];
  abstract SelectNextTask(creep: CreepExtra): CreepTask | null;
  abstract GetRoomQuota(room: RoomExtra): number;

  // Init
  protected readonly log: Logger<CreepRoleBase> = new Logger(this, { formatArgs: { "<role>": this } });
  constructor(protected readonly colony: Colony) { }
  toString(): string { return `[role ${this.name}]`; }

  // Default Implementations
  IsSpawnNeeded(room: RoomExtra): boolean { return this.GetRoomCreepsInRole(room).length < this.GetRoomQuota(room); }
  GetGlobalCreepsInRole(): CreepExtra[] { return this.colony.MyCreeps.filter(c => c.memory.role === this.name); }
  GetNewCreepName(_room: RoomExtra): string { return GetRandomName(); }
  GetRoomCreepsInRole(room: RoomExtra): CreepExtra[] { return room.AssignedCreeps.filter(c => c.memory.role === this.name); }
  OnCleanup(): void { return; }
  OnSpawn(_creep: CreepExtra): void { return; }
  OnSpawnScheduled(room: RoomExtra, name: string): void { return; }
  RoomTickEnd(): void { return; }
  RoomTickStart(): void { return; }
  TickCreep(_creep: CreepExtra): void { return; }
  EndOfTick(): void { return; }
  StartOfTick(): void { return; }
}
