/* eslint-disable @typescript-eslint/no-unused-vars */
import { Colony } from 'Colony';
import { CreepExtra } from 'Creep';
import { GetRandomName } from 'Data';
import { RoomExtra } from 'Room';
import { CreepTask } from 'tasks/types';
import { Filters, GetValueByName, MakeBody, Sorts } from 'utils/Collections';
import { Logger } from 'utils/Logger';
import { FirstBodyByEnergyCapacity } from 'utils/RoomUtils';

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

  GetGlobalQuota(): number | undefined;
  GetRoomQuota(room: RoomExtra): number;

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

  GetGlobalQuota(): number | undefined {
    return undefined;
  }

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
  private roomQuotaChangeCheckTimes: { [roomName: RoomExtra['name']]: number } = {};

  // Default number of ticks between invocations of `GetQuotaChange`
  protected RoleQuotaChangeFrequency = 500;

  /**
   * Base quota lookup for current value from cache, while respecting a
   * room's `roleLimits`, and without updating the `roomQuotaCheckTimes`.
   */
  private CurrentQuota(room: RoomExtra): number {
    const current = GetValueByName(this.currentRoomQuotas, room, () => this.GetRoomCreepsInRole(room).length);
    const overridenQuota = (room.memory.roleLimits ??= {})[this.roleName];
    if (overridenQuota !== undefined) {
      this.log.warn('Quota overridden.', { '<room>': room, current, overridenQuota });
      return overridenQuota;
    }
    return Math.min(this.GetMaxQuota(room), Math.max(this.GetMinQuota(room), current));
  }

  /**
   * Change the quota for this role in the given room by some amount.
   *
   * This function updates the check times for the role, so
   * automated checking will be delayed until the next cycle by calling this.
   *
   * @param room The room to change the quota in.
   * @param quotaDelta Either a new number for the quota, or a function on the current quota to a new quota.
   * @param current The current quota, optional to save the lookup if you already have the amount.
   * @param minQuota The minimum quota, optional to save the lookup if you already have the amount.
   * @param maxQuota The maximum quota, optional to save the lookup if you already have the amount.
   * @returns The new (or current if unchanged) quota for the role.
   */
  protected ChangeQuota(
    room: RoomExtra,
    quotaDelta: number | ((curr: number) => number),
    updateCheckTime = true,
    current = this.CurrentQuota(room),
    minQuota = this.GetMinQuota(room),
    maxQuota = this.GetMaxQuota(room),
  ): number {
    if (updateCheckTime) this.roomQuotaChangeCheckTimes[room.name] = Game.time;

    // Calculate new Quota based on input
    if (typeof quotaDelta !== 'number') quotaDelta = quotaDelta(current);
    let newQuota = current + quotaDelta;

    // Early return for no change
    if (quotaDelta === 0 || newQuota === current) return current;

    // Clamp newQuota to Max
    if (newQuota > maxQuota) {
      this.log.warn('Clamping newQuota to maximum.', {
        '<room>': room,
        current,
        minQuota,
        newQuota,
        quotaDelta,
        maxQuota,
      });
      newQuota = maxQuota;
    }

    // Clamp newQuota to Min
    if (newQuota < minQuota) {
      this.log.warn('Clamping newQuota to minimum.', {
        '<room>': room,
        current,
        minQuota,
        newQuota,
        quotaDelta,
        maxQuota,
      });
      newQuota = minQuota;
    }

    if (newQuota === current) return current;

    // Assign to cache to be served on later requests, and return
    this.log.info('Changing quota.', { '<room>': room, current, quotaDelta, newQuota });
    return (this.currentRoomQuotas[room.name] = newQuota);
  }

  protected TimeSinceQuotaUpdate(room: RoomExtra): number {
    return Game.time - GetValueByName(this.roomQuotaChangeCheckTimes, room, () => Game.time);
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
  GetRoomQuota(room: RoomExtra, current = this.CurrentQuota(room)) {
    if (this.TimeSinceQuotaUpdate(room) > this.RoleQuotaChangeFrequency)
      return this.ChangeQuota(room, this.GetQuotaChange(room), true, current);
    return current;
  }

  GetGlobalCreepsInRole(): CreepExtra[] {
    return this.colony.MyCreeps.filter(Filters.CreepMemoryRoleName(this.roleName));
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
  RoomTickStart(_room: RoomExtra): void {
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
  RallyDistance = 2;

  Searches = {
    AttackNearestStructure: (pos: RoomPosition) => pos.lookFor(LOOK_STRUCTURES),
    AttackCreeps: (pos: RoomPosition) => pos.findInRange(FIND_HOSTILE_CREEPS, 3),
    HealAllies: (pos: RoomPosition) => pos.findInRange(FIND_MY_CREEPS, 3, { filter: Filters.Damaged }),
    RalliedAllies: (pos: RoomPosition) => pos.findInRange(this.GetGlobalCreepsInRole(), this.RallyDistance + 1),
  } as const;

  GetFirstAvailableBodyWithZygote(
    potentialBodies: BodyPartConstant[][],
    room: RoomExtra,
    zygote: BodyPartConstant[],
    emergencySpawnTimer?: number,
  ): BodyPartConstant[] {
    if (emergencySpawnTimer && Game.time - room.LastSpawnTick(this.roleName) > emergencySpawnTimer) return zygote;
    const body = FirstBodyByEnergyCapacity(room, ...potentialBodies, zygote);
    if (body) return body;
    else return zygote;
  }

  /**
   * Return true if living amount of creeps is under the desired amount of creeps.
   *
   * Will result in periodic quota changes if the role is configured to use them.
   *
   * @param room The room in which to check the quota.
   * @returns True if the room needs
   */
  IsRoleUnderRoomQuota(room: RoomExtra): boolean {
    const quota = this.GetRoomQuota(room);
    return quota > 0 && this.GetRoomCreepsInRole(room).length < quota;
  }

  IsRoleUnderGlobalQuota(): boolean {
    const globalQuota = this.GetGlobalQuota();
    if (!globalQuota || globalQuota === 0) return true;
    return this.GetGlobalCreepsInRole().length < globalQuota;
  }

  HealHurtAlliesOrSelf(creep: CreepExtra): ScreepsReturnCode {
    // Heal whoever in range is the most hurt
    const hurtAllies = this.Searches.HealAllies(creep.pos);
    for (const ally of hurtAllies.sort(Sorts.StructureHitsRatioAsc))
      if (ally && creep.pos.isNearTo(ally)) return creep.heal(ally);
      else if (ally) return creep.rangedHeal(ally);
    if (Filters.Damaged(creep)) return creep.heal(creep);
    return ERR_NOT_FOUND;
  }

  AttackWeakestAdjacentEnemy(creep: CreepExtra): ScreepsReturnCode {
    const closeEnemies = creep.pos
      .findInRange(FIND_HOSTILE_CREEPS, 1, { filter: Filters.Damaged })
      .sort(Sorts.StructureHitsRatioAsc);
    for (const enemy of closeEnemies) if (enemy) return creep.attack(enemy);
    return ERR_NOT_FOUND;
  }

  RangedAttackWeakestHittableEnemy(creep: CreepExtra): ScreepsReturnCode {
    const closeEnemies = creep.pos
      .findInRange(FIND_HOSTILE_CREEPS, 3, { filter: Filters.Damaged })
      .sort(Sorts.StructureHitsRatioAsc);
    for (const enemy of closeEnemies) if (enemy) return creep.rangedAttack(enemy);
    return ERR_NOT_FOUND;
  }

  AttackOrHeal(creep: CreepExtra): void {
    if (creep.getActiveBodyparts(ATTACK) > 0) if (this.AttackWeakestAdjacentEnemy(creep) === OK) return;
    if (creep.getActiveBodyparts(RANGED_ATTACK) > 0) if (this.RangedAttackWeakestHittableEnemy(creep) === OK) return;
    if (creep.getActiveBodyparts(HEAL) > 0) if (this.HealHurtAlliesOrSelf(creep) === OK) return;
  }
}
