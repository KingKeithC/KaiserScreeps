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

  override GetGlobalQuota(): number { return this.AllClaims().length; }
  override GetRoomQuota(room: RoomExtra): number { return this.UnworkedClaims(room).length; }

  // Don't spawn claimers unless we have at least 10 living creeps
  IsSpawnNeeded(room: RoomExtra): boolean { return room.AssignedCreeps.length > 10; }


  AllClaims(): Flag[] { return Object.values(Game.flags).filter(f => f.name.startsWith("Claim")); }

  WorkedClaims(room: RoomExtra): string[] {
    return unique(room.GetAssignedTasks(TaskAction.Claim).map(p => (p as ClaimRoomTask).roomName));
  }

  UnworkedClaims(room: RoomExtra): Flag[] {
    const worked = this.WorkedClaims(room);
    const ret = [];
    for (const claim of this.AllClaims())
      if (claim.pos.roomName in worked) continue;
      else ret.push(claim);
    return ret;
  }

  override GetInitialTask(room: RoomExtra): CreepTask | null {
    for (const c of this.UnworkedClaims(room))
      return new ClaimRoomTask(c.pos.roomName, c.name.includes("!CLAIM"));
    return null;
  }
}
