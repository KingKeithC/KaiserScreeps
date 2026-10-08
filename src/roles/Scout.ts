import { CreepExtra } from "Creep";
import { unique } from "lodash";
import { RoomRole } from "./Role";

type TravelPath = { exit: ExitConstant; room: string; }[];

class ScoutMemory extends Object {
  roomName?: string;
  path?: TravelPath;
}

export class Scout extends RoomRole<ScoutMemory> {
  static readonly RoleName: string = "Scout";
  BodyParts = [MOVE, MOVE, MOVE, MOVE];

  override get CountPerRoom(): number { return this.GlobalCount; }
  override get GlobalCount(): number { return this.FindAllScoutedRoomNames().length; }

  InitialJobMemory = new ScoutMemory();

  FindScoutFlags(): Flag[] { return Object.values(Game.flags).filter(f => f.name.startsWith("Scout")); }
  FindAllScoutedRoomNames(): string[] { return unique(this.FindScoutFlags().map(p => p.pos.roomName)); }
  GroupScoutsByScoutedRoom(): Map<string, CreepExtra[]> {
    const res = new Map();
    for (const r of this.FindAllScoutedRoomNames())
      res.set(r, []);
    for (const c of this.CreepsInRole.filter(c => (c.memory.jobMemory as ScoutMemory).roomName))
      res.set((c.memory.jobMemory as ScoutMemory).roomName, [...(res.get((c.memory.jobMemory as ScoutMemory).roomName) ?? []), c]);
    return res;
  }
  FindLeastScoutedRoom(): string | null {
    const groups = this.GroupScoutsByScoutedRoom();
    var res = null;

    for (const [name, scouts] of groups.entries())
      if (!scouts.length) res = name;

    return res;
  }

  TickCreep(creep: CreepExtra, task: ScoutMemory): void {
    // Find a room to scout
    if (!task.roomName) {
      const name = this.FindLeastScoutedRoom();
      if (!name) {
        console.log(`Unable to find a room to scout.`);
        return;
      }
      task.roomName = name;
      creep.memory.jobMemory = task;
    }

    // Are we in the target room?
    if (creep.room.name === task.roomName) {
      console.log(`We reached the target room ${task.roomName}.`);
      this.ReachedScoutedRoom();
      return;
    } else if (task.path && task.path.length > 0) {
      console.log(`There is a path to travel...`);
      this.TravelAlongPath(creep, task.path);
      return;
    } else if (task.path == undefined || task.path.length === 0) {
      console.log(`Locating path from ${creep.room.name} to ${task.roomName}...`);
      const path = Game.map.findRoute(creep.room.name, task.roomName);
      if (path === -2) {
        console.log(`Unable to find a route from ${creep.room.name} to ${task.roomName}...`);
        return;
      }
      task.path = path;
      creep.memory.jobMemory = task;
    }

    console.log("Todo...");
  }

  TravelAlongPath(creep: CreepExtra, path: TravelPath): void {
    if (
      creep.pos.x === 0
      || creep.pos.x === 49
      || creep.pos.y === 0
      || creep.pos.y === 49
    ) {
      console.log(`${Game.time} Stuck on an edge (${creep.pos.x}, ${creep.pos.y}) in ${creep.pos.roomName}...`);
      creep.move(path[0].exit);
    }

    // const exit = creep.pos.findClosestByPath(path[0].exit);
    // if (!exit) {
    //   console.log("Unable to find exit to room!");
    //   return;
    // }
  }

  ReachedScoutedRoom(): void { }
}
