/* eslint-disable @typescript-eslint/no-unused-vars */
import { Colony } from 'Colony';
import { CreepExtra } from 'Creep';
import { GetRandomName } from 'Data';
import { RoomExtra } from 'Room';
import { CreepTask } from 'tasks/types';
import { Logger } from 'utils/Logger';

export interface CreepRole {
  readonly roleName: string;
  readonly groupName: string;
  readonly priority: number; // Lower means higher priority

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

export interface RoleClass<Role extends CreepRole = CreepRole> {
  readonly name: Role['roleName'];
  readonly roleName: Role['roleName'];
  readonly groupName: Role['groupName'];
  readonly priority: Role['priority'];
  readonly prototype: Role;
  new (colony: Colony): Role;
}

export abstract class CreepRoleBase {
  readonly roleName: string;
  readonly groupName: string;
  readonly priority: number;

  // Must be supplied by derived roles.
  abstract GetNewCreepBody(room: RoomExtra): BodyPartConstant[];
  abstract SelectNextTask(creep: CreepExtra): CreepTask | null;
  abstract GetMinQuota(room: RoomExtra): number;

  /**
   *
   * Returns true if the room should try to spawn this role.
   *
   * Highly recommended to call `IsRoleUnderQuota` and return false early,
   * since the room won't do it automatically.
   *
   * @param room The room in which to check if a spwan is needed.
   */
  abstract IsSpawnNeeded(room: RoomExtra): boolean;

  // Init
  protected readonly log: Logger<CreepRoleBase> = new Logger(this, { formatArgs: { '<role>': this } });
  constructor(protected readonly colony: Colony) {
    const roleClass = this.constructor as RoleClass;
    this.roleName = roleClass.roleName;
    this.groupName = roleClass.groupName;
    this.priority = roleClass.priority;
  }

  // Defaults

  get name(): string {
    return this.roleName;
  }

  toString(): string {
    return `[role ${this.roleName}]`;
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

  // Mapping of room name to the current live quota value.
  private currentRoomQuotas: { [roomName: RoomExtra['name']]: number } = {};

  // Mapping of room name to the last time we called `SetQuota` for it.
  private roomQuotaSetTimes: { [roomName: RoomExtra['name']]: number } = {};

  private GetRoomCacheValue(
    cache: { [roomName: RoomExtra['name']]: number },
    room: RoomExtra,
    initialValue: () => number,
  ): number {
    return (cache[room.name] ??= initialValue());
  }

  // Default number of ticks between invocations of `GetQuotaChange`
  protected RoleQuotaChangeFrequency = 200;

  /**
   * Base quota lookup for current value from cache, while respecting a
   * room's `roleLimits`, and without updating the `roomQuotaCheckTimes`.
   */
  private CurrentQuota(room: RoomExtra): number {
    const current = this.GetRoomCacheValue(this.currentRoomQuotas, room, () => this.GetMinQuota(room));
    const overridenQuota = (room.memory.roleLimits ??= {})[this.roleName];
    if (overridenQuota !== undefined) {
      this.log.warn('Quota overridden.', { '<room>': room, current, overridenQuota });
      return overridenQuota;
    }
    return current;
  }

  /**
   * Set a new quota for this role in the given room.
   *
   * This function updates the check times for the role, so
   * automated checking will be delayed until the next cycle by calling this.
   *
   * @param room The room to change the quota in.
   * @param newQuota Either a new number for the quota, or a function on the current quota to a new quota.
   * @param current The current quota, optional to save the lookup if you already have the amount.
   * @param minQuota The minimum quota, optional to save the lookup if you already have the amount.
   * @param maxQuota The maximum quota, optional to save the lookup if you already have the amount.
   * @returns The new (or current if unchanged) quota for the role.
   */
  protected SetQuota(
    room: RoomExtra,
    newQuota: number | ((curr: number) => number),
    current = this.CurrentQuota(room),
    minQuota = this.GetMinQuota(room),
    maxQuota = this.GetMaxQuota(room),
  ): number {
    this.roomQuotaSetTimes[room.name] = Game.time;

    // Calculate new Quota based on input
    if (typeof newQuota !== 'number') newQuota = newQuota(current); // Resolve on current if we got a function
    const diff = newQuota - current;
    if (diff === 0) return current;

    // Clamp newQuota to Min/Max Range
    if (newQuota > maxQuota) {
      this.log.warn('Clamping newQuota to maximum.', { '<room>': room, diff, current, newQuota, maxQuota });
      newQuota = maxQuota;
    } else if (newQuota < minQuota) {
      this.log.warn('Clamping newQuota to minimum.', { '<room>': room, diff, current, newQuota, minQuota });
      newQuota = minQuota;
    }

    if (newQuota >= minQuota && newQuota <= maxQuota) {
      // If new quota is acceptible, update cache and return.
      this.log.info('Changing quota.', { '<room>': room, current, newQuota, diff });
      return (this.currentRoomQuotas[room.name] = newQuota);
    }

    return current;
  }

  protected TimeSinceQuotaUpdate(room: RoomExtra): number {
    return Game.time - this.GetRoomCacheValue(this.roomQuotaSetTimes, room, () => Game.time);
  }

  /**
   * Get the current quota for the role in the room.
   *
   * Also periodically checks if the quota needs to be changed, and if so
   * invokes `GetQuotaChange` to fetch changes to the quota, and updates it
   * accordingly before returning the new value.
   *
   * @param room The room in which to get the quota setting.
   * @param current The current quota, optional to save the lookup if you already have the amount.
   * @returns The current number of Creeps with this role that should be spawned in the room.
   */
  GetQuota(room: RoomExtra, current = this.CurrentQuota(room)) {
    if (this.TimeSinceQuotaUpdate(room) > this.RoleQuotaChangeFrequency)
      return this.SetQuota(room, this.GetQuotaChange(room), current);
    return current;
  }

  GetGlobalCreepsInRole(): CreepExtra[] {
    return this.colony.MyCreeps.filter(c => c.memory.role === this.roleName);
  }
  GetNewCreepName(_room: RoomExtra): string {
    return GetRandomName();
  }
  GetRoomCreepsInRole(room: RoomExtra): CreepExtra[] {
    return room.GetAssignedCreepsOfRole(this.roleName);
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

  /**
   * Return true if living amount of creeps is under the desired amount of creeps.
   *
   * Will result in periodic quota changes if the role is configured to use them.
   *
   * @param room The room in which to check the quota.
   * @returns True if the room needs
   */
  IsRoleUnderQuota(room: RoomExtra): boolean {
    const quota = this.GetQuota(room);
    return quota > 0 && this.GetRoomCreepsInRole(room).length < quota;
  }
}
