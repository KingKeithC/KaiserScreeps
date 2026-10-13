import { CreepExtra } from "Creep";
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

  override GetGlobalQuota(): number { return this.GetFlags.length; }
  override GetRoomQuota(room: RoomExtra): number { return -1; }
  IsSpawnNeeded(room: RoomExtra): boolean { return this.GetGlobalCreepsInRole().length < this.GetFlags().length; }
  SelectNextTask(creep: CreepExtra, room: RoomExtra, lastTask: CreepTask | null): CreepTask | null { return this.GetInitialTask(room); }

  GetFlags(): Flag[] { return Object.values(Game.flags).filter(f => f.name.startsWith("Claim")); }

  override GetInitialTask(room: RoomExtra): CreepTask | null {
    const allClaimedRooms = this.GetFlags().filter(f => f.pos.roomName);
    const claimedRoomsInProgress = this.GetGlobalCreepsInRole().filter(c => c.currentTask?.action === TaskAction.Claim).map(c => (c.currentTask as ClaimRoomTask).roomName);

    for (const c of allClaimedRooms)
      if (!(c.pos.roomName in claimedRoomsInProgress))
        return new ClaimRoomTask(c.pos.roomName, c.name.includes(":Reserve"));

    return null;
  }

}
