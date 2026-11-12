import { CreepExtra } from 'Creep';
import { SOURCE_KEEPER_USERNAME } from 'Data';
import { Move, Attack } from 'tasks';
import { CreepTask } from 'tasks/types';
import { MakeBody } from 'utils/Collections';
import { CreepRole, CreepRoleBase } from './Role';

export class SourceTaker extends CreepRoleBase implements CreepRole {
  override roleName = 'SourceTaker';
  override groupName = 'Warriors';
  override priority = 30;

  GetNewCreepBody(): BodyPartConstant[] {
    return MakeBody([MOVE, 4], [WORK, 1], [ATTACK, 1], [HEAL, 2]);
  }

  SearchRange = 20;
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

  SourceKeeperFlag?: Flag;
  StartOfTick(): void {
    this.SourceKeeperFlag = Game.flags.SourceKeeper;
  }

  GetMinQuota(): number {
    return this.SourceKeeperFlag !== undefined ? 1 : 0;
  }

  IsSpawnNeeded(): boolean {
    return this.SourceKeeperFlag !== undefined;
  }
}
