import type { CreepExtra } from "Creep";
import { TaskAction } from "./TaskAction";
import { BaseTask } from "./BaseTask";
import type { TaskActionResult } from "./types";

export class Idle extends BaseTask<typeof TaskAction.Idle> {
    public readonly kind = "idle" as const;

    public constructor(
        public speak: string = "",
        public sayPublicly: boolean = false,
    ) { super(TaskAction.Idle); }

    public override isComplete(_creep: CreepExtra): boolean { return true; }

    public override act(creep: CreepExtra): TaskActionResult | null {
        if (this.speak.length > 0) creep.say(this.speak, this.sayPublicly);
        return null;
    }
}
