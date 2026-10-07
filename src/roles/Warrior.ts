import { CreepExtra } from "Creep";
import { RoomRole } from "./Role";


class WarriorMemory extends Object {
  targetCreep?: Id<CreepExtra>
}

export class Warrior extends RoomRole<WarriorMemory> {
  static readonly RoleName: string = "Warrior";
  InitialJobMemory: WarriorMemory = new WarriorMemory();
  BodyParts = [MOVE, MOVE, MOVE, TOUGH, TOUGH, ATTACK, ATTACK];

  // 1 Per Invader
  get CountPerRoom() {
    if ((this.room.memory.attackHostiles ?? false) || (this.room.memory.disableWarriors ?? false))
      return this.room.HostileCreeps.length;
    else
      return 0;
  }

  TickCreep(creep: CreepExtra, mem: WarriorMemory): void { }
}
