import type { CreepExtra } from "Creep";
import { TaskAction } from "./TaskAction";
import { TargetTask } from "./BaseTask";
import type { TaskActionResult } from "./types";

export class GuardTask extends TargetTask<typeof TaskAction.Guard, Id<StructureRampart> | undefined> {
    public readonly kind = "guard" as const;

    public constructor(
        public rampartId?: Id<StructureRampart>,
    ) {
        super(TaskAction.Guard, rampartId, rampartId ? "rampart" : "nothing");
    }

    public override isComplete(creep: CreepExtra): boolean {
        return creep.room.find(FIND_HOSTILE_CREEPS).length > 0;
    }

    public act(creep: CreepExtra): TaskActionResult | null {
        if (!this.rampartId) return null;
        const rampart = Game.getObjectById(this.rampartId);
        if (!rampart) return null;
        if (creep.pos === rampart.pos) return null;
        return { range: 0, result: ERR_NOT_IN_RANGE, target: rampart };
    }
}
