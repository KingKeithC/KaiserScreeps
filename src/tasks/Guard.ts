import { CreepExtra } from "Creep";
import { Logger } from "utils/Logger";
import { TargetTask } from "./TargetTask";
import { TaskAction } from "./TaskAction";
import { TaskActionResult } from "./types";

interface GuardOptions {
  rampartId?: Id<StructureRampart>;
}

export class GuardTask extends TargetTask<typeof TaskAction.Guard, string> {
  public readonly kind = "guard" as const;

  private rampartId?: Id<StructureRampart>;

  public constructor(
    public roomName: string,
    public options: GuardOptions = {},
  ) {
    super(TaskAction.Guard, roomName, "room");
    this.rampartId = options.rampartId;
  }

  public override isComplete(creep: CreepExtra): boolean {
    for (const [r, hs] of creep.AssignedRoom.HostilesByRoom.entries())
      if (hs.length > 0) {
        Logger.warn(`GuardTask: Ending for ${creep.name} since we spotted ${hs.length} creeps in ${r}`);
        return true;
      }
    return false;
  }

  public act(creep: CreepExtra): TaskActionResult | null {
    if (!(this.roomName in Game.rooms))
      return { range: 25, result: ERR_NOT_IN_RANGE, target: { pos: new RoomPosition(25, 25, this.roomName) } };

    let room = Game.rooms[this.roomName];
    let rampart = this.rampartId ? Game.getObjectById(this.rampartId) : null;
    if (!room && !rampart) return null;
    if (!room && rampart) room = rampart.room;

    const hostiles = room.find(FIND_HOSTILE_CREEPS);
    if (hostiles) { // Attack closest hostile
      const closestHostile = creep.pos.findClosestByPath(hostiles);
      if (closestHostile) return { range: 1, target: closestHostile, result: creep.attack(closestHostile) };
      return null; // No path to hostiles
    }

    // No hostiles, guard a rampart
    if (!rampart) {
      const found = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_RAMPART });
      if (found) {
        this.rampartId = found.id as Id<StructureRampart>;
        rampart = found as StructureRampart;
      } else
        // No rampart, move to room centre
        return { range: 25, target: { pos: new RoomPosition(25, 25, this.roomName) }, result: ERR_NOT_IN_RANGE };
    }

    return { range: 0, target: rampart, result: ERR_NOT_IN_RANGE };
  }
}
