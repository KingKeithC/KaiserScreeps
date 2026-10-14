import type { CreepExtra } from "Creep";
import { TaskAction } from "./TaskAction";
import { TargetTask } from "./BaseTask";
import { TaskActionResult } from "./types";
import { MiningPosition } from "utils/Collections";

export class Mine extends TargetTask<typeof TaskAction.Mine, MiningPosition> {
  public readonly kind = "mine" as const;

  public constructor(mp: MiningPosition) { super(TaskAction.Mine, mp, "mining position"); }

  public override act(creep: CreepExtra): TaskActionResult | null {
    const source = Game.getObjectById(this.target.sourceId);
    if (!source)
      return { range: 0, result: ERR_NOT_IN_RANGE, target: { pos: new RoomPosition(this.target.position.x, this.target.position.y, this.target.position.roomName) } };

    const outcome = this.perform(source, 1, source => creep.harvest(source));
    if (outcome?.result === ERR_NOT_OWNER) outcome.result = ERR_NOT_IN_RANGE; // Ignore owner errors, forward to a 'move' instruction
    return outcome;
  }

  public override isComplete(creep: CreepExtra): boolean {
    // A miner's work is never done
    const isAMiner = creep.role?.groupName === "Miners";
    if (isAMiner) return false;

    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0)
      return true;

    if (creep.pos.findInRange(FIND_MY_CREEPS, 4, { filter: c => c.memory.role.startsWith("Miner") }).length > 0)
      return true;

    const source = Game.getObjectById(this.target.sourceId);
    return !(source instanceof Source) || source.energy === 0;
  }
}
