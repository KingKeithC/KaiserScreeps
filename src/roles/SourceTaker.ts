import { CreepExtra } from 'Creep';
import { INVADER_USERNAME, SOURCE_KEEPER_USERNAME } from 'Data';
import { sum } from 'lodash';
import { Move, Attack } from 'tasks';
import { CreepTask } from 'tasks/types';
import { MakeBody } from 'utils/Collections';
import { FromEdgeIntoRoom } from 'utils/CreepUtils';
import { AddDirectionToPosition, FindClosestOfRoom } from 'utils/RoomUtils';
import { CreepRole, CreepRoleBase } from './Role';

type AttackPhase = 'Queue' | 'Drain' | 'Attack';

export class SourceTaker extends CreepRoleBase implements CreepRole {
  override roleName = 'SourceTaker';
  override groupName = 'Warriors';
  override priority = 30;

  override GetGlobalQuota = () => 6;
  GetMinQuota(): number {
    return this.SourceKeeperFlag !== undefined ? 1 : 0;
  }

  IsSpawnNeeded(): boolean {
    return this.SourceKeeperFlag !== undefined;
  }

  private attackPhase: AttackPhase = 'Drain';
  get AttackPhase(): AttackPhase {
    return this.attackPhase;
  }

  // When the attack phase changes, reset the current task of all creeps in this role
  set AttackPhase(phase: AttackPhase) {
    if (this.attackPhase !== phase) this.GetGlobalCreepsInRole().forEach(c => (c.memory.currentTask = null));
    this.attackPhase = phase;
  }

  GetNewCreepBody(): BodyPartConstant[] {
    if (this.AttackPhase === 'Drain') return MakeBody([TOUGH, 20], [MOVE, 12], [HEAL, 4]);

    // this.AttackPhase === 'Attack'
    return MakeBody([TOUGH, 4], [MOVE, 8], [CARRY, 2], [HEAL, 4]);
  }

  override OnSpawn(creep: CreepExtra): void {
    creep.notifyWhenAttacked(false);
  }

  SourceKeeperFlag?: Flag;
  KeeperRoom?: Room;
  QueuePoint?: RoomPosition;
  QueuedGroup?: CreepExtra[];

  GetAttackPhase(): SourceTaker['AttackPhase'] {
    const group = this.GetGlobalCreepsInRole();
    if (group.length < this.GetGlobalQuota()) return 'Queue';
    this.SourceKeeperFlag = Game.flags.SourceKeeper;
    if (!this.SourceKeeperFlag) return 'Queue';
    this.KeeperRoom = this.colony.Rooms.get(this.SourceKeeperFlag.pos.roomName);
    if (!this.KeeperRoom) {
      const queue = this.QueuePoint;
      if (!queue) return 'Queue';
      const allAtQueuePoint = group.every(c => c.pos.inRangeTo(queue, this.RallyRange));
      if (!allAtQueuePoint) return 'Queue';
      this.QueuedGroup = group;
      return 'Drain';
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const invaderTowers = this.KeeperRoom.find(FIND_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_TOWER && s.owner && s.owner.username === INVADER_USERNAME,
    }) as StructureTower[];

    if (sum(invaderTowers, t => t.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0) > 0) {
      return 'Drain';
    }

    return 'Attack';
  }

  StartOfTick(): void {
    this.QueuePoint ??= this.GetQueuePoint();
    this.AttackPhase = this.GetAttackPhase();
  }

  GetQueuePoint(): RoomPosition | undefined {
    // Find the room of mine that is closest to the SourceKeeper flag's room
    const myRooms = this.colony.MyRooms.map(r => r.name);
    if (!this.SourceKeeperFlag) return;
    const closestRoomName = FindClosestOfRoom(myRooms, this.SourceKeeperFlag.pos.roomName);
    if (!closestRoomName) return;
    const closestRoom = this.colony.Rooms.get(closestRoomName);
    if (!closestRoom) return;
    const exitToTargetRoom = closestRoom.findExitTo(this.SourceKeeperFlag.pos.roomName);
    if (!exitToTargetRoom || exitToTargetRoom === ERR_NO_PATH || exitToTargetRoom === ERR_INVALID_ARGS) return;
    const directionToSafety = FromEdgeIntoRoom(exitToTargetRoom);
    const exitPoss = closestRoom.find(exitToTargetRoom);
    if (!exitPoss || exitPoss.length === 0 || !directionToSafety) return;
    return AddDirectionToPosition(exitPoss[0], directionToSafety, this.RallyRange + 4);
  }

  SearchRange = 10;
  RallyRange = 5;
  SelectNextTask(creep: CreepExtra): CreepTask | null {
    if (this.SourceKeeperFlag === undefined) {
      return null;
    }

    // Rally to the queue point if in the 'Queue' attack phase
    const queue = this.QueuePoint;
    if (this.AttackPhase === 'Queue' && queue !== undefined) {
      return new Move(queue, this.RallyRange - 1);
    } else if (this.AttackPhase === 'Queue') return null;

    // No longer in Queue phase, move towards the target room if not already there
    if (creep.pos.roomName !== this.SourceKeeperFlag.pos.roomName) {
      return new Move(this.SourceKeeperFlag.pos, this.RallyRange);
    }

    // Attack any nearby Source Keeper enemies within the search range
    const enemies = creep.pos.findInRange(FIND_HOSTILE_CREEPS, this.SearchRange);
    for (const enemy of enemies)
      if (this.colony.Allies.includes(enemy.owner.username)) continue;
      else if (enemy.owner.username !== SOURCE_KEEPER_USERNAME) continue;
      else return new Attack(enemy);

    return null;
  }

  TickCreep(creep: CreepExtra): void {
    this.AttackOrHeal(creep);
  }
}
