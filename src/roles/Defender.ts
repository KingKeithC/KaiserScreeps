import { CreepExtra } from "Creep";
import { groupBy } from "lodash";
import type { RoomExtra } from "Room";
import { CreepTask, TaskAction, GuardTask } from "tasks";
import { Attack } from "tasks/Attack";
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
    for (const [r, v] of room.HostilesByRoom) total += v.length;
    return total;
  }

  override GetInitialTask(room: RoomExtra): CreepTask {
    const hostile = this.FindLeastTargetedHostile(room);
    return hostile ? new Attack(hostile) : new GuardTask(room.name);
  }


  public SelectNextTask(creep: CreepExtra): CreepTask {
    const hostile = this.FindNearestHostile(creep);
    if (!hostile) { return new GuardTask(creep.room.name); }
    return new Attack(hostile);
  }

  public OnSpawn(creep: CreepExtra): void { creep.notifyWhenAttacked(false); }

  TickCreep(creep: CreepExtra): void {
    if (creep.getActiveBodyparts(ATTACK) > 0) {
      // Attack Ranged Enemies
      const closeEnemy = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 3, { filter: c => c.hits < c.hitsMax }).sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax)).pop();
      if (closeEnemy) creep.rangedAttack(closeEnemy);

      // Attack Melee Enemies
      const touchingEnemy = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 1, { filter: c => c.hits < c.hitsMax }).sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax)).pop();
      if (touchingEnemy) creep.attack(touchingEnemy);
    }

    if (creep.getActiveBodyparts(HEAL) > 0) {
      // Heal friendles that are near but not touching
      const rangedNeedsHeal = creep.pos.findInRange(FIND_MY_CREEPS, 3, { filter: c => c.hits < c.hitsMax }).sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax)).pop();
      if (rangedNeedsHeal) creep.rangedHeal(rangedNeedsHeal);

      // Heal friendles that are touching
      const closeNeedsHeal = creep.pos.findInRange(FIND_MY_CREEPS, 1, { filter: c => c.hits < c.hitsMax }).sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax)).pop();
      if (closeNeedsHeal) creep.heal(closeNeedsHeal);

      // Heal self
      if (creep.hits < creep.hitsMax) creep.heal(creep);
    }
  }

  FindLeastTargetedHostile(room: RoomExtra): Creep | null {
    const attacksByTarget = groupBy(room.GetAssignedTasks(TaskAction.Attack), a => (a as Attack).target);
    for (const [r, creeps] of room.HostilesByRoom)
      for (const c of creeps)
        if ((attacksByTarget[c.id] ?? []).length === 0) return c;
    return null;
  }

  FindNearestHostile(creep: CreepExtra): Creep | null {
    // Find Hostiles in the current room
    for (const [room, creeps] of creep.AssignedRoom.HostilesByRoom)
      if (room.name === creep.room.name) {
        const found = creep.pos.findClosestByPath(creeps);
        if (found) return found;
      }

    // Find Hostiles in any room
    for (const [r, creeps] of creep.AssignedRoom.HostilesByRoom)
      if (creeps.length > 0) {
        const found = creeps.pop();
        if (found) return found;
      }

    return null;
  }
}
