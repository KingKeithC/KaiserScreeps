/* eslint-disable @typescript-eslint/no-unused-vars */
import { Colony } from 'Colony';
import { CreepExtra } from 'Creep';
import { GetRandomName } from 'Data';
import { RoomExtra } from 'Room';
import { CreepTask } from 'tasks/types';
import { Logger } from 'utils/Logger';

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

  GetQuota(room: RoomExtra): number;

  GetGlobalCreepsInRole(): CreepExtra[]; // Get all creeps assigned to this role in the colony
  GetRoomCreepsInRole(room: RoomExtra): CreepExtra[]; // Get all creeps  assigned to this role in the room

  IsSpawnNeeded(room: RoomExtra): boolean; // Decide if a spawn is needed for a room.
  OnSpawnScheduled(room: RoomExtra, name: string): void; // Run after a creep is started spawning.
  OnSpawn(creep: CreepExtra): void; // Run on the first tick after a creep is spawned.
  OnCleanup(room: RoomExtra, creepName: string, creepMemory: CreepMemory): void;
}

export abstract class CreepRoleBase implements CreepRole {
  // Must be supplied by derived roles.
  abstract readonly name: string;
  abstract readonly groupName: string;
  abstract GetNewCreepBody(room: RoomExtra): BodyPartConstant[];
  abstract SelectNextTask(creep: CreepExtra): CreepTask | null;
  abstract GetMinQuota(room: RoomExtra): number;
  abstract IsSpawnNeeded(room: RoomExtra): boolean;

  // Init
  protected readonly log: Logger<CreepRoleBase> = new Logger(this, { formatArgs: { '<role>': this } });
  constructor(protected readonly colony: Colony) {}

  // Default Implementations
  toString(): string {
    return `[role ${this.name}]`;
  }

  /**
   * Get a delta for how much the quota should change by.
   * @param room The room in which to change quotas.
   * @returns A delta for how much the quota should change
   */
  GetQuotaChange(room: RoomExtra): number {
    return 0;
  }

  /**
   * Get the maximum allowed quota of this role.
   *
   * Defaults to the min quota, no change allowed.
   *
   * @param room
   * @returns
   */
  GetMaxQuota(room: RoomExtra): number {
    return this.GetMinQuota(room);
  }

  private roomQuotaCheckTimes: { [roomName: RoomExtra['name']]: number } = {};
  private currentRoomQuotas: { [roomName: RoomExtra['name']]: number } = {};
  protected RoleQuotaChangeFrequency = 1000;

  private CurrentQuota(room: RoomExtra): number {
    const current = (this.currentRoomQuotas[room.name] ??= this.GetMinQuota(room));
    const overridenQuota = (room.memory.roleLimits ??= {})[this.name];
    if (overridenQuota !== undefined) {
      this.log.warn('Quota overridden from ${current} to ${overridenQuota}', {
        '<room>': room,
        current,
        overridenQuota,
      });
      return overridenQuota;
    }
    return current;
  }

  SetQuota(
    room: RoomExtra,
    newQuota: number,
    current = this.CurrentQuota(room),
    minQuota = this.GetMinQuota(room),
    maxQuota = this.GetMaxQuota(room),
  ): number {
    this.roomQuotaCheckTimes[room.name] = Game.time; // Update check time
    const diff = newQuota - current;
    if (diff === 0) return current;

    if (newQuota >= minQuota && newQuota <= maxQuota) {
      // If new quota is acceptible, update cache and return.
      this.log.info('Changing Quota from ${current} to ${newQuota} (${diff})');
      return (this.currentRoomQuotas[room.name] = newQuota);
    } else if (newQuota > maxQuota)
      this.log.warn(
        'Cannot change Quota from ${current} to ${newQuota} (${diff}), since it is above max of ${maxQuota}',
        { '<room>': room, diff, current, newQuota, maxQuota },
      );
    else if (newQuota < minQuota)
      this.log.warn(
        'Cannot change Quota from ${current} to ${newQuota} (${diff}), since it is below min of ${minQuota}',
        { '<room>': room, diff, current, newQuota, minQuota },
      );

    return current;
  }

  GetQuota(room: RoomExtra) {
    const current = this.CurrentQuota(room);
    const ticksSinceLastChange = Game.time - (this.roomQuotaCheckTimes[room.name] ??= Game.time);
    if (ticksSinceLastChange > this.RoleQuotaChangeFrequency)
      return this.SetQuota(room, this.GetQuotaChange(room), current);
    return current;
  }

  GetGlobalCreepsInRole(): CreepExtra[] {
    return this.colony.MyCreeps.filter(c => c.memory.role === this.name);
  }
  GetNewCreepName(_room: RoomExtra): string {
    return GetRandomName();
  }
  GetRoomCreepsInRole(room: RoomExtra): CreepExtra[] {
    return room.GetAssignedCreepsOfRole(this.name);
  }
  OnCleanup(): void {
    return;
  }
  OnSpawn(_creep: CreepExtra): void {
    return;
  }
  OnSpawnScheduled(room: RoomExtra, name: string): void {
    return;
  }
  RoomTickEnd(): void {
    return;
  }
  RoomTickStart(): void {
    return;
  }
  TickCreep(_creep: CreepExtra): void {
    return;
  }
  EndOfTick(): void {
    return;
  }
  StartOfTick(): void {
    return;
  }

  // Extra utilities
  IsRoleUnderQuota(room: RoomExtra): boolean {
    const quota = this.GetMinQuota(room);
    return quota > 0 && this.GetRoomCreepsInRole(room).length < quota;
  }
}
