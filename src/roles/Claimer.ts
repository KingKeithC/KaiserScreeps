import { CreepExtra } from "Creep";
import { unique } from "lodash";
import type { RoomExtra } from "Room";
import { ClaimRoomTask, CreepTask, Dismantle, Idle, Move, TaskAction } from "tasks";
import { FormatStructureHits, MakeBody } from "utils/Collections";
import { CreepRole, CreepRoleBase } from "./Role";


export class Claimer extends CreepRoleBase implements CreepRole {
  readonly groupName = "Warriors";
  readonly name = "Claimer";
  readonly tier = 1;

  GetNewCreepBody(_room: RoomExtra): BodyPartConstant[] {
    return MakeBody(
      [MOVE, 3],
      [CLAIM, 1],
    );
  }

  override GetGlobalQuota(): number { return this.AllClaims().length; }
  override GetRoomQuota(room: RoomExtra): number { return this.UnworkedClaims(room).length; }
  IsSpawnNeeded(room: RoomExtra): boolean { return this.AllClaims().length > 0; }
  SelectNextTask(creep: CreepExtra, lastTask: CreepTask | null): CreepTask | null { return this.GetInitialTask(creep.AssignedRoom); }

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
