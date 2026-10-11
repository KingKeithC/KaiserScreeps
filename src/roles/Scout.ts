import { CreepExtra } from "Creep";
import type { RoomExtra } from "Room";
import type { CreepTask } from "Tasks";
import { Idle, ScoutMissionTask } from "Tasks";
import { CreepRole, CreepRoleBase } from "./Role";

export class Scout extends CreepRoleBase implements CreepRole {
  readonly groupName = "Scouts";
  readonly name = "Scout";
  readonly tier = 1;

  GetNewCreepBody(_room: RoomExtra): BodyPartConstant[] {
    return [MOVE, MOVE, MOVE, MOVE];
  }

  override GetInitialTask(_room: RoomExtra): CreepTask {
    const flag = this.FindLeastScoutedRoom();
    return flag ? new ScoutMissionTask(flag.name) : new Idle();
  }

  override GetRoomQuota(_room: RoomExtra): number {
    return this.FindScoutFlags().length;
  }

  public SelectNextTask(_creep: CreepExtra, _room: RoomExtra): CreepTask {
    const nextFlag = this.FindLeastScoutedRoom();
    return nextFlag ? new ScoutMissionTask(nextFlag.name) : new Idle();
  }

  public TaskAct(creep: CreepExtra, task: CreepTask, _room: RoomExtra): void {
    if (task.kind !== "scout" || !("flag" in task) || !("path" in task)) return;

    const flagName = task.flag as string;
    const path = task.path as { exit: ExitConstant; room: string; }[];
    const currentFlag = Game.flags[flagName];
    if (!currentFlag || currentFlag.pos.roomName === undefined) return;

    if (!path || path.length === 0) {
      const route = Game.map.findRoute(creep.room.name, currentFlag.pos.roomName);
      if (route === ERR_NO_PATH) return;
      task.path = route;
      return;
    }

    if (
      creep.pos.x === 0
      || creep.pos.x === 49
      || creep.pos.y === 0
      || creep.pos.y === 49
    ) {
      this.log.info(`${Game.time} Stuck on an edge (${creep.pos.x}, ${creep.pos.y}) in ${creep.pos.roomName}...`);
      if (path[0]) creep.move(path[0].exit);
      return;
    }

    if (creep.room.name === path[0]?.room) {
      this.log.info(`We reached the next room along the path...`);
      task.path = path.slice(1);
      return;
    }

    if (creep.room.name !== currentFlag.pos.roomName) {
      const nextRoom = path[0];
      if (!nextRoom) {
        this.ReachedScoutedRoom(creep, currentFlag);
        return;
      }
      const exit = creep.pos.findClosestByPath(nextRoom.exit);
      if (!exit) {
        this.log.info(`No path to exit ${nextRoom.exit} from ${creep.pos.roomName}`);
        return;
      }
      this.log.info(`Moving to exit of ${creep.pos.roomName} toward ${nextRoom.room}...`);
      creep.MoveCreep(exit, { range: 0 });
      return;
    }

    this.ReachedScoutedRoom(creep, currentFlag);
  }

  FindScoutFlags(): Flag[] { return Object.values(Game.flags).filter(f => f.name.startsWith("Scout")); }

  GroupScoutsByFlag(): Map<Flag, CreepExtra[]> {
    const res = new Map<Flag, CreepExtra[]>();
    for (const flag of this.FindScoutFlags()) res.set(flag, []);
    for (const creep of this.GetGlobalCreepsInRole()) {
      const task = creep.currentTask;
      if (task?.kind !== "scout" || !("flag" in task)) continue;
      const flag = Game.flags[task.flag as string];
      if (!flag) continue;
      res.set(flag, [...(res.get(flag) ?? []), creep]);
    }
    return res;
  }

  FindLeastScoutedRoom(): Flag | null {
    for (const [flag, scouts] of this.GroupScoutsByFlag().entries())
      if (!scouts.length) return flag;
    return null;
  }

  ReachedScoutedRoom(creep: CreepExtra, flag: Flag): void {
    if (creep.MoveCreep(flag.pos, { range: 5 }) !== 1) return;
    if (Game.time % 100 === 0) this.log.info("We're here!");
  }
}
