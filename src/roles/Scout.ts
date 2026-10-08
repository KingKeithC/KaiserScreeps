import { CreepExtra } from "Creep";
import { unique } from "lodash";
import { RoomRole } from "./Role";

type TravelPath = { exit: ExitConstant; room: string; }[];

class ScoutMemory extends Object {
  roomName?: string;
  path?: TravelPath;
  flag?: string;
}

export class Scout extends RoomRole<ScoutMemory> {
  static readonly RoleName: string = "Scout";
  BodyParts = [MOVE, MOVE, MOVE, MOVE];

  override get CountPerRoom(): number { return this.GlobalCount; }
  override get GlobalCount(): number { return this.FindScoutFlags().length; }

  get InitialJobMemory() {
    const mem = new ScoutMemory();
    const flag = this.FindLeastScoutedRoom();
    if (!flag) throw new Error("No unassigned scout flags found!");
    mem.flag = flag.name;
    return mem;
  }

  FindScoutFlags(): Flag[] { return Object.values(Game.flags).filter(f => f.name.startsWith("Scout")); }
  GroupScoutsByFlag(): Map<Flag, CreepExtra[]> {
    const res = new Map();
    for (const f of this.FindScoutFlags())
      res.set(f, []);
    for (const c of this.CreepsInRole.filter(c => (c.memory.jobMemory as ScoutMemory).flag))
      res.set((c.memory.jobMemory as ScoutMemory).flag, [...(res.get((c.memory.jobMemory as ScoutMemory).flag) ?? []), c]);
    return res;
  }
  FindLeastScoutedRoom(): Flag | null {
    for (const [flag, scouts] of this.GroupScoutsByFlag().entries())
      if (!scouts.length) return flag;
    return null;
  }

  TickCreep(creep: CreepExtra, task: ScoutMemory): void {
    // Find a room to scout
    if (!task.flag) {
      const flag = this.FindLeastScoutedRoom();
      if (!flag) {
        this.log.info(`Unable to find a scouting flag.`);
        return;
      }
      task.flag = flag.name;
      creep.memory.jobMemory = task;
    }

    // Lookup the flag we are following
    const flag = Game.flags[task.flag] as Flag;
    if (!flag || flag == undefined || flag.pos.roomName == undefined) {
      this.log.info(`Scouting flag appears to be invalid or deleted or in non visible room.`);
      return;
    }

    if (!task.path || task.path.length === 0) {
      const path = Game.map.findRoute(creep.room.name, flag.pos.roomName);
      if (path === ERR_NO_PATH) {
        this.log.info(`Unable to find a path to ${flag.pos.roomName}.`);
        return;
      }
      task.path = path;
      creep.memory.jobMemory = task;
    }

    // Are we on the edge?
    if (
      creep.pos.x === 0
      || creep.pos.x === 49
      || creep.pos.y === 0
      || creep.pos.y === 49
    ) {
      this.log.info(`${Game.time} Stuck on an edge (${creep.pos.x}, ${creep.pos.y}) in ${creep.pos.roomName}...`);
      creep.move(task.path[0].exit);
    } else if (creep.room.name === task.path[0].room) {
      this.log.info(`We reached the next room along the path...`);
      task.path = task.path.slice(1); // Move the path along to the remaining segments
      creep.memory.jobMemory = task;
      return;
    } else if (creep.room.name !== task.roomName) {
      this.log.info(`Still travelling...`);
      const nextRoom = task.path[0];
      const exit = creep.pos.findClosestByPath(nextRoom.exit);
      if (!exit) {
        this.log.info(`No path to exit ${nextRoom.exit} from ${creep.pos.roomName}`);
        return;
      }
      this.log.info(`Moving to exit of ${creep.pos.roomName} toward ${nextRoom.room}...`);
      creep.MoveCreep(exit, { range: 0 });
      return;
    }

    this.log.info(`We reached the target room ${task.roomName}.`);
    this.ReachedScoutedRoom(creep, flag);
  }

  ReachedScoutedRoom(creep: CreepExtra, flag: Flag): void {
    if (creep.MoveCreep(flag.pos, { range: 5 }) !== 1) return;
    if (Game.time % this.NotificationInterval === 0) this.log.info("We're here!");
  }
}
