import { CreepExtra } from "Creep";
import { groupBy } from "lodash";
import type { RoomExtra } from "Room";
import { CreepTask, Idle, TaskAction } from "tasks";
import { AttackTargetTask, GuardTask } from "tasks";
import { MakeBody } from "utils/Collections";
import { CreepRole, CreepRoleBase } from "./Role";

export class Defender extends CreepRoleBase implements CreepRole {
  readonly groupName = "Warriors";
  readonly name = "Defender";
  readonly tier = 1;

  IsSpawnNeeded(room: RoomExtra): boolean { return room.Hostiles.length > 1; }

  GetNewCreepBody(_room: RoomExtra): BodyPartConstant[] {
    return MakeBody([TOUGH, 2], [ATTACK, 2], [MOVE, 3], [HEAL, 1]);
  }

  GetGlobalQuota(): number { return -1; }

  override GetInitialTask(room: RoomExtra): CreepTask {
    const hostile = this.FindLeastTargetedHostile(room);
    return hostile ? new AttackTargetTask(hostile) : new GuardTask(room.name);
  }

  // 1 For each hostile
  override GetRoomQuota(room: RoomExtra): number {
    if (room.AttackHostiles && !room.DisableWarriors)
      return room.Hostiles.length;
    return 0;
  }

  public SelectNextTask(creep: CreepExtra): CreepTask {
    const hostile = this.FindLeastTargetedHostile(creep.AssignedRoom);
    if (!hostile) { return new GuardTask(creep.AssignedRoom.name); }
    return new AttackTargetTask(hostile);
  }

  FindLeastTargetedHostile(room: RoomExtra): Id<Creep> | null {
    const attacksByTarget = groupBy(room.GetAssignedTasks(TaskAction.Attack), a => (a as AttackTargetTask).targetId);
    for (const target in attacksByTarget) if (attacksByTarget[target].length === 0) return target as Id<Creep>;
    return null;
  }

  Idle(creep: CreepExtra): void {
    if (Game.time % 25 === 3) creep.say("zzz");
    const rampart = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_RAMPART });
    if (!rampart) return;
    creep.MoveCreep(rampart, { range: 0 });
  }

  Charging(_creep: CreepExtra): void { return; }
}
