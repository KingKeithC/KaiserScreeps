import { CreepExtra } from "Creep";
import { RoomRole } from "./Role";


class WarriorMemory extends Object {
  targetCreep?: Id<CreepExtra>;
}

export class Warrior extends RoomRole<WarriorMemory> {
  static readonly RoleName: string = "Warrior";
  InitialJobMemory: WarriorMemory = new WarriorMemory();
  BodyParts = [MOVE, MOVE, MOVE, TOUGH, TOUGH, ATTACK, ATTACK];
  SpawnRate = 20;

  // 1 Per Invader
  get CountPerRoom() {
    if (this.manager.AttackHostiles && !this.manager.DisableWarriors)
      return this.manager.room.find(FIND_HOSTILE_CREEPS).length;
    else
      return 0;
  }

  FindHostiles(): CreepExtra[] { return this.manager.room.find(FIND_HOSTILE_CREEPS); }

  HostileIdsByWarrior(): Map<CreepExtra, CreepExtra[]> {
    const res = new Map();
    for (const h of this.FindHostiles())
      res.set(h, []);
    for (const t of this.CreepsInRole.filter(c => (c.memory.jobMemory as WarriorMemory).targetCreep))
      res.set((t.memory.jobMemory as WarriorMemory).targetCreep, [...(res.get((t.memory.jobMemory as WarriorMemory).targetCreep) ?? []), t]);
    return res;
  }

  FindLeastTargtedWeakestHostile(): CreepExtra | null {
    const groups = this.HostileIdsByWarrior();
    for (const [tgt, comrades] of groups.entries())
      if (comrades.length === 0) return tgt;
    return null;
  }

  TickCreep(creep: CreepExtra, mem: WarriorMemory): void {
    if (!mem.targetCreep) {
      const tgt = this.FindLeastTargtedWeakestHostile();
      if (tgt == null || tgt == undefined) {
        // console.log("No hostiles found...");
        this.Idle(creep);
        return;
      }
      mem.targetCreep = tgt.id;
      creep.memory.jobMemory = mem;
    }

    const target = Game.creeps[mem.targetCreep] as CreepExtra;
    if (!target) {
      console.log(`Target is inaccessible! Resetting...`);
      creep.memory.jobMemory = {};
      return;
    }

    if (creep.MoveCreep(target, { range: 1 }) !== 1) {
      this.Charging(creep);
      return;
    }

    creep.attack(target);
  }

  Idle(creep: CreepExtra): void {
    if (Game.time % this.NotificationInterval === 3) creep.say('zzz');
    const rampart = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_RAMPART });
    if (!rampart) return;
    creep.moveTo(rampart, { range: 0 });
  }

  Charging(creep: CreepExtra): void { }
}
