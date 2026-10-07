import { CreepExtra } from "Creep";
import { unique } from "lodash";
import { RoomRole } from "./Role";

type TravelPath = { exit: ExitConstant; room: string; }[];

class ScoutMemory extends Object {
  roomName?: string;
  path?: TravelPath;
}

export class Scout extends RoomRole<ScoutMemory> {
  static readonly RoleName: string = "SettleScout";
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
      this.TravelAlongPath(task.path);
      return;
    } else if (task.path == undefined || task.path.length === 0) {
      console.log(`Locating path from ${creep.room.name} to ${task.roomName}...`);
      const path = Game.map.findRoute(creep.room.name, task.roomName);
      if (path === -2) {
        console.log(`Unable to find a route from ${creep.room.name} to ${task.roomName}...`);
        return;
      }
    }

    console.log("Todo...");
  }

  TravelAlongPath(path: TravelPath): void { }
  ReachedScoutedRoom(): void { }
}
