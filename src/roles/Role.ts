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

  GetQuota(room: RoomExtra) {
    // Get current quota (or min if not defined) from the derived role
    const min = this.GetMinQuota(room);
    let current = (this.currentRoomQuotas[room.name] ??= min);

    // If the room have an overridden quota for us, use it instead, but log a warning
    const overridenQuota = (room.memory.roleLimits ??= {})[this.name];
    if (overridenQuota !== undefined) {
      this.log.warn('Quota overridden from ${current} to ${overridenQuota}', {
        '<room>': room,
        current,
        overridenQuota,
      });
      return overridenQuota;
    }

    const max = this.GetMaxQuota(room);
    if (max === min) return current; // No room to change

    // Change the Quota if needed

    // If no check has ever been done, then wait a full cycle and check on the next one
    const ticksSinceLastChange = Game.time - (this.roomQuotaCheckTimes[this.name] ??= Game.time);
    if (ticksSinceLastChange > this.RoleQuotaChangeFrequency) {
      // Change for a change in quota
      const diff = this.GetQuotaChange(room);
      if (diff !== 0) {
        const newQuota = current + diff;
        if (newQuota >= min && newQuota <= max) {
          // If new quota is acceptible, update cache and return.
          this.log.warn('Changing Quota from ${current} to ${newQuota}');
          current = this.currentRoomQuotas[room.name] = newQuota;
        } else if (newQuota > max)
          this.log.warn(
            'Cannot change Quota from ${current} to ${newQuota} (${diff}), since it is above max of ${max}',
            { '<room>': room, diff, current, newQuota, max },
          );
        else if (newQuota < min)
          this.log.warn(
            'Cannot change Quota from ${current} to ${newQuota} (${diff}), since it is below min of ${min}',
            { '<room>': room, diff, current, newQuota, min },
          );
      }
    }
    this.roomQuotaCheckTimes[this.name] = Game.time; // Update check time

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
