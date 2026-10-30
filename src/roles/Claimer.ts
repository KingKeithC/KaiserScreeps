import { CreepExtra } from 'Creep';
import { unique } from 'lodash';
import type { RoomExtra } from 'Room';
import { Claim, CreepTask, TaskAction } from 'tasks';
import { MakeBody } from 'utils/Collections';
import { CreepRole, CreepRoleBase } from './Role';

export class Claimer extends CreepRoleBase implements CreepRole {
  readonly groupName = 'Warriors';
  readonly name = 'Claimer';

  GetNewCreepBody(room: RoomExtra): BodyPartConstant[] {
    if (room.energyCapacityAvailable >= 1300) return MakeBody([MOVE, 2], [CLAIM, 2]);

    return MakeBody([MOVE, 1], [CLAIM, 1]);
  }

  IsSpawnNeeded(room: RoomExtra): boolean {
    return this.UnworkedClaims(room).length > 0;
  }
  override GetRoomQuota(room: RoomExtra): number {
    return room.ClaimedRoomNames.length;
  }

  WorkedClaims(room: RoomExtra): string[] {
    return unique(room.GetAssignedTasks(TaskAction.Claim).map(p => (p as Claim).targetId));
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
      }
    return null;
  }
}
