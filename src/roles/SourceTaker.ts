import { CreepExtra } from 'Creep';
import { INVADER_USERNAME, SOURCE_KEEPER_USERNAME } from 'Data';
import { sum } from 'lodash';
import { Move, Attack } from 'tasks';
import { CreepTask } from 'tasks/types';
import { MakeBody } from 'utils/Collections';
import { CreepRole, CreepRoleBase } from './Role';

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

  AttackPhase: 'Drain' | 'Attack' = 'Drain';

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
  StartOfTick(): void {
    this.SourceKeeperFlag = Game.flags.SourceKeeper;
    if (!this.SourceKeeperFlag) return;
    this.KeeperRoom = this.colony.Rooms.get(this.SourceKeeperFlag.pos.roomName);
    if (!this.KeeperRoom) {
      this.AttackPhase = 'Drain';
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const invaderTowers = this.KeeperRoom.find(FIND_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_TOWER && s.owner && s.owner.username === INVADER_USERNAME,
    }) as StructureTower[];
    if (sum(invaderTowers, t => t.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0) > 0) {
      this.AttackPhase = 'Drain';
    } else {
      this.AttackPhase = 'Attack';
    }
  }

  SearchRange = 10;
  RallyRange = 5;
  SelectNextTask(creep: CreepExtra): CreepTask | null {
    if (this.SourceKeeperFlag === undefined) {
      return null;
    }

    if (creep.pos.roomName !== this.SourceKeeperFlag.pos.roomName) {
      return new Move(this.SourceKeeperFlag.pos, this.RallyRange);
    }

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
