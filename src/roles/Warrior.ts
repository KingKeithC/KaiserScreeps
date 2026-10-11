import { CreepExtra } from "Creep";
import type { RoomExtra } from "Room";
import { CreepTask, Idle } from "Tasks";
import { AttackTargetTask, GuardTask } from "Tasks";
import { CreepRole, CreepRoleBase } from "./Role";

export class Warrior extends CreepRoleBase implements CreepRole {
  readonly groupName = "Warriors";
  readonly name = "Warrior";
  readonly tier = 1;

  SpawnRate = 20;

  GetNewCreepBody(_room: RoomExtra): BodyPartConstant[] {
    return [MOVE, MOVE, MOVE, TOUGH, TOUGH, ATTACK, ATTACK];
  }

  override GetInitialTask(_room: RoomExtra): CreepTask { return new Idle(); }

  override GetRoomQuota(room: RoomExtra): number {
    if (room.AttackHostiles && !room.DisableWarriors)
      return room.find(FIND_HOSTILE_CREEPS).length;
    return 0;
  }

  public SelectNextTask(creep: CreepExtra, room: RoomExtra): CreepTask {
    const hostile = this.FindLeastTargetedHostile(room);
    return hostile ? new AttackTargetTask(hostile.id as Id<Creep>) : new GuardTask();
  }

  public TaskAct(creep: CreepExtra, task: CreepTask, _room: RoomExtra): void {
    if (task.kind === "idle" || task.kind === "guard") {
      this.Idle(creep);
      return;
    }
    if (task.kind !== "attack" || !("targetId" in task)) return;

    const target = Game.getObjectById(task.targetId as Id<Creep>);
    if (!(target instanceof Creep)) return;

    if (creep.MoveCreep(target, { range: 1 }) !== 1) {
      this.Charging(creep);
      return;
    }

    creep.attack(target);
  }

  FindHostiles(room: RoomExtra): Creep[] { return room.find(FIND_HOSTILE_CREEPS); }

  HostileIdsByWarrior(room: RoomExtra): Map<Creep, CreepExtra[]> {
    const res = new Map<Creep, CreepExtra[]>();
    for (const hostile of this.FindHostiles(room)) res.set(hostile, []);
    for (const creep of this.GetGlobalCreepsInRole()) {
      const task = creep.currentTask;
      if (task?.kind !== "attack" || !("targetId" in task)) continue;
      const target = Game.getObjectById(task.targetId as Id<Creep>);
      if (!(target instanceof Creep)) continue;
      res.set(target, [...(res.get(target) ?? []), creep]);
    }
    return res;
  }

  FindLeastTargetedHostile(room: RoomExtra): Creep | null {
    const groups = this.HostileIdsByWarrior(room);
    for (const [target, comrades] of groups.entries())
      if (comrades.length === 0) return target;
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
