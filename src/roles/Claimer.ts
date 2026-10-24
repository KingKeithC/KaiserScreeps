import { CreepExtra } from "Creep";
import { unique } from "lodash";
import type { RoomExtra } from "Room";
import { ClaimRoomTask, CreepTask, TaskAction } from "tasks";
import { MakeBody } from "utils/Collections";
import { CreepRole, CreepRoleBase } from "./Role";


export class Claimer extends CreepRoleBase implements CreepRole {
  readonly groupName = "Warriors";
  readonly name = "Claimer";

  GetNewCreepBody(room: RoomExtra): BodyPartConstant[] {
    if (room.energyCapacityAvailable >= 1300)
      return MakeBody(
        [MOVE, 2],
        [CLAIM, 2],
      );

    return MakeBody(
      [MOVE, 1],
      [CLAIM, 1],
    );
  }

  IsSpawnNeeded(room: RoomExtra): boolean { return this.UnworkedClaims(room).length > 0; }
  override GetGlobalQuota(): number { return this.AllClaims().length; }
  override GetRoomQuota(): number { return -1; }


  AllClaims(): Flag[] { return Object.values(Game.flags).filter(f => f.name.startsWith("Claim")); }
  WorkedClaims(room: RoomExtra): string[] {
    return unique(room.colony.GetAllAssignedTasks(TaskAction.Claim).map(p => (p as ClaimRoomTask).target));
  }

  UnworkedClaims(room: RoomExtra): Flag[] {
    const worked = this.WorkedClaims(room);
    const ret = [];
    for (const claim of this.AllClaims())
      if (worked.includes(claim.pos.roomName)) continue;
      else ret.push(claim);
    return ret;
  }

  override SelectNextTask(creep: CreepExtra): CreepTask | null {
    for (const c of this.UnworkedClaims(creep.AssignedRoom))
      return new ClaimRoomTask(c.pos.roomName, c.name.includes("!CLAIM"));
    return null;
  }
}
