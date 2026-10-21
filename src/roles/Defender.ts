import { CreepExtra } from "Creep";
import { groupBy, sum } from "lodash";
import type { RoomExtra } from "Room";
import { CreepTask, TaskAction , AttackTargetTask, GuardTask } from "tasks";
import { MakeBody } from "utils/Collections";
import { CreepRole, CreepRoleBase } from "./Role";

export class Defender extends CreepRoleBase implements CreepRole {
  readonly groupName = "Warriors";
  readonly name = "Defender";

  IsSpawnNeeded(room: RoomExtra): boolean { return room.Hostiles.length > 1; }

  GetNewCreepBody(): BodyPartConstant[] {
    return MakeBody([TOUGH, 2], [ATTACK, 2], [MOVE, 3], [HEAL, 1]);
  }

  GetGlobalQuota(): number { return -1; }

  override GetInitialTask(room: RoomExtra): CreepTask {
    const hostile = this.FindLeastTargetedHostile(room);
    return hostile ? new AttackTargetTask(hostile) : new GuardTask(room.name);
  }

  // 1 For each hostile
  override GetRoomQuota(room: RoomExtra): number {
    let total = 0;
    for (const v of room.HostilesByRoom.values()) total += v.length;
    return total;
  }

  public SelectNextTask(creep: CreepExtra): CreepTask {
    const hostile = this.FindLeastTargetedHostile(creep.AssignedRoom);
    if (!hostile) { return new GuardTask(creep.AssignedRoom.name); }
    return new AttackTargetTask(hostile);
  }

  FindLeastTargetedHostile(room: RoomExtra): Id<Creep> | null {
    const attacksByTarget = groupBy(room.GetAssignedTasks(TaskAction.Attack), a => (a as AttackTargetTask).targetId);
    for (const [roomName, creeps] of room.HostilesByRoom.entries())
      for (const c of creeps)
        if (attacksByTarget[c.name].length === 0) return c.id;
    return null;
  }
}
