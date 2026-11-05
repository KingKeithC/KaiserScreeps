import { CreepExtra } from 'Creep';
import { unique } from 'lodash';
import type { RoomExtra } from 'Room';
import { Claim, Move } from 'tasks';
import { TaskAction, CreepTask } from 'tasks/types';
import { MakeBody } from 'utils/Collections';
import { CreepRoleBase, CreepRole } from './Role';

export class Claimer extends CreepRoleBase implements CreepRole {
  readonly groupName = 'Warriors';
  readonly name = 'Claimer';
  readonly priority = 2;

  GetNewCreepBody(room: RoomExtra): BodyPartConstant[] {
    if (room.energyCapacityAvailable >= 1300) return MakeBody([MOVE, 2], [CLAIM, 2]);

    return MakeBody([MOVE, 1], [CLAIM, 1]);
  }

  IsSpawnNeeded(room: RoomExtra): boolean {
    if (!this.IsRoleUnderQuota(room)) return false;
    return this.UnworkedClaims(room).length > 0;
  }

  override GetMinQuota(room: RoomExtra): number {
    return room.ClaimedRoomNames.length;
  }

  WorkedClaims(room: RoomExtra): string[] {
    return unique([...room.AssignedTasks(TaskAction.Claim)].map(p => p.targetId));
  }

  UnworkedClaims(room: RoomExtra): string[] {
    const worked = this.WorkedClaims(room);
    const ret = [];
    for (const claim of room.ClaimedRoomNames)
      if (worked.includes(claim)) continue;
      else ret.push(claim);
    return ret;
  }

  override SelectNextTask(creep: CreepExtra): CreepTask | null {
    for (const c of this.UnworkedClaims(creep.AssignedRoom))
      if (c in Game.rooms) {
        const controller = Game.rooms[c].controller;
        if (controller !== undefined) return new Claim(controller, false);
      } else {
        const exit = creep.room.findExitTo(c);
        if (exit === ERR_NO_PATH || exit === ERR_INVALID_ARGS) return null;
        const expitPos = creep.pos.findClosestByPath(exit);
        if (!expitPos) return null;

        // Set the entry pos to be 2 linear tiles toward the exit dir
        const entryPos = new RoomPosition(expitPos.x, expitPos.y, c);
        if (expitPos.y === 0)
          // MOVE UP
          entryPos.y = 48;
        else if (expitPos.x === 49)
          // MOVE RIGHT
          entryPos.x = 1;
        else if (expitPos.y === 49)
          // MOVE DOWN
          entryPos.y = 1;
        else if (expitPos.x === 0)
          // LEFT
          entryPos.x = 48;

        return new Move(entryPos, 0);
      }
    return null;
  }
}
