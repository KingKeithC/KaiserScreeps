import { CreepExtra } from "Creep";
import { groupBy, sum } from "lodash";
import type { RoomExtra } from "Room";
import { CreepTask, TaskAction , AttackTargetTask, GuardTask } from "tasks";
import { MakeBody } from "utils/Collections";
import { CreepRole, CreepRoleBase } from "./Role";

export class Defender extends CreepRoleBase implements CreepRole {
  readonly groupName = "Warriors";
  readonly name = "Defender";


  GetNewCreepBody(): BodyPartConstant[] {
    return MakeBody([TOUGH, 2], [ATTACK, 2], [MOVE, 3], [HEAL, 1]);
  }

  IsSpawnNeeded(room: RoomExtra): boolean { return this.GetRoomQuota(room) > 1; }
  GetGlobalQuota(): number { return -1; }
  // 1 For each hostile
  override GetRoomQuota(room: RoomExtra): number {
    let total = 0;
    for (const v of room.HostilesByRoom.values()) total += v.length;
    return total;
  }

  override GetInitialTask(room: RoomExtra): CreepTask {
    const hostile = this.FindLeastTargetedHostile(room);
    return hostile ? new AttackTargetTask(hostile) : new GuardTask(room.name);
  }


  public SelectNextTask(creep: CreepExtra): CreepTask {
    const hostile = this.FindLeastTargetedHostile(creep.AssignedRoom);
    if (!hostile) { return new GuardTask(creep.AssignedRoom.name); }
    return new AttackTargetTask(hostile);
  }

  TickCreep(creep: CreepExtra): void {
    if (creep.getActiveBodyparts(ATTACK) > 0) {
      // Attack Ranged Enemies
      const closeEnemy = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 3, {filter: c => c.hits < c.hitsMax}).sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax)).pop()
      if (closeEnemy) creep.rangedAttack(closeEnemy)

      // Attack Melee Enemies
      const touchingEnemy = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 1, {filter: c => c.hits < c.hitsMax}).sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax)).pop()
      if (touchingEnemy) creep.attack(touchingEnemy)
    }

    if (creep.getActiveBodyparts(HEAL) > 0) {
      // Heal friendles that are near but not touching
      const rangedNeedsHeal = creep.pos.findInRange(FIND_MY_CREEPS, 3, {filter: c => c.hits < c.hitsMax}).sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax)).pop()
      if (rangedNeedsHeal) creep.rangedHeal(rangedNeedsHeal);

      // Heal friendles that are touching
      const closeNeedsHeal = creep.pos.findInRange(FIND_MY_CREEPS, 1, {filter: c => c.hits < c.hitsMax}).sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax)).pop()
      if (closeNeedsHeal) creep.heal(closeNeedsHeal)

      // Heal self
      if (creep.hits < creep.hitsMax) creep.heal(creep);
    }
  }

  FindLeastTargetedHostile(room: RoomExtra): Id<Creep> | null {
    const attacksByTarget = groupBy(room.GetAssignedTasks(TaskAction.Attack), a => (a as AttackTargetTask).targetId);
    for (const [roomName, creeps] of room.HostilesByRoom.entries())
      for (const c of creeps)
        if (attacksByTarget[c.name].length === 0) return c.id;
    return null;
  }
}
