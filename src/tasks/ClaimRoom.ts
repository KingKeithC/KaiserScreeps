import type { CreepExtra } from "Creep";
import { TaskAction } from "./TaskAction";
import { BaseTask } from "./BaseTask";
import type { TravelPath } from "./types";

export class ClaimRoomTask extends BaseTask<typeof TaskAction.Claim> {
    public readonly kind = "claim" as const;

    public constructor(
        public readonly roomName: string,
        public path: TravelPath = [],
        public readonly reserve = false,
    ) { super(TaskAction.Claim); }

    public toString(): string { return `${this.action} ${this.roomName}`; }

    public override isComplete(_creep: CreepExtra): boolean {
        if (!this.roomName) return true;
        return Game.rooms[this.roomName]?.controller?.my === true;
    }
}
