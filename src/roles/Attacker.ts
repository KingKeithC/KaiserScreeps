import { CreepExtra } from "Creep";
import type { RoomExtra } from "Room";
import { CreepTask, Dismantle, Idle, Move, TaskAction } from "Tasks";
import { FormatStructureHits, MakeBody } from "utils/Collections";
import { CreepRole, CreepRoleBase } from "./Role";


type AttackType = "Rally" | "NearestStructure";

declare global {
  interface FlagMemory {
    attackIndex?: number,
    attackType?: AttackType,
    done?: boolean,
  }
}


export class Attacker extends CreepRoleBase implements CreepRole {
  readonly groupName = "Warriors";
  readonly name = "Attacker";
  readonly tier = 1;

  RallyDistance = 2;
  AttackSize = 1;

  GetNewCreepBody(_room: RoomExtra): BodyPartConstant[] {
    return MakeBody(
      [MOVE, 5],
      [WORK, 6],
      [ATTACK, 2],
      [HEAL, 1]
    );
  }

  GetAttackPlan(): Flag[] {
    const flags = Object.values(Game.flags).filter(f => f.name.startsWith("Attack") && f.name.includes(':'));
    for (const f of flags) {
      // Set initial memory for flags based on name
      const [_, index, action] = f.name.split(":");
      f.memory.attackIndex ??= Number.parseInt(index);
      f.memory.attackType ??= action as AttackType;
      f.memory.done ??= false;
    }
    return flags.sort((a, b) => a.memory.attackIndex! - b.memory.attackIndex!);
  }

  // Return the first step in the sequence that is not complete
  GetCurrentStep(): Flag | null {
    for (const step of this.GetAttackPlan())
      if (!step.memory.done) return step;
    return null;
  }

  GetLastStep(): Flag | null {
    const allSteps = this.GetAttackPlan();
    const next = this.GetCurrentStep();
    if (!next || allSteps.length < 2) return null;
    const idx = allSteps.indexOf(next);
    return allSteps[idx - 1];
  }

  TickStart(): void {

  }

  TickEnd(): void {
    const curr = this.GetCurrentStep();
    if (curr) this.SetStepCompletion(curr);
  }

  SetStepCompletion(step: Flag): void {
    if (!(step.pos.roomName in Game.rooms)) {
      // Step is no longer accessible, mark as incomplete
      if (Game.time % 10 === 0) this.log.info(`Attack Step ${step.name} in progress, traveling to ${step.pos.roomName}...`);
      step.memory.done = false;
      return;
    } else if (step.memory.attackType === "Rally") {
      // Rally step is complete when enough attackers in range to rally site
      const found = step.pos.findInRange(this.GetGlobalCreepsInRole(), this.RallyDistance + 1);
      if (found.length >= this.AttackSize) {
        this.log.warn(`Rally Step ${step.name} completed.`);
        step.memory.done = true;
        return;
      } else {
        if (Game.time % 10 === 0) this.log.info(`Attack ${step.memory.attackIndex}: ${step.memory.attackType} (${found.length}/${this.AttackSize})...`);
        step.memory.done = false;
        return;
      }
    } else if (step.memory.attackType === "NearestStructure") {
      // NearestStructure is complete when
      const nearby = step.pos.findClosestByRange(FIND_STRUCTURES);
      if (!nearby) {
        this.log.warn(`Attack ${step.memory.attackIndex}: ${step.memory.attackType} completed.`);
        step.memory.done = true;
        return;
      } else {
        if (Game.time % 10 === 0) this.log.info(`Attack ${step.memory.attackIndex}: ${step.memory.attackType} in progress on (${nearby}), ${FormatStructureHits(nearby)}...`);
        step.memory.done = false;
        return;
      }
    }
  }

  HealHurtAllies(creep: CreepExtra): void {
    // Heal whoever in range is the most hurt
    const hurtAllies = creep.pos.findInRange(FIND_MY_CREEPS, 3, { filter: c => c.hits < c.hitsMax });
    const mostHurt = hurtAllies.sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax)).pop();
    if (mostHurt && creep.pos.getRangeTo(mostHurt) === 1)
      creep.heal(mostHurt);
    else if (mostHurt)
      creep.rangedHeal(mostHurt);
  }

  AttackEnemies(creep: CreepExtra): void {
    const hurtEnemies = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 1);
    const mostHurt = hurtEnemies.sort((b, a) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax)).pop();
    if (mostHurt) creep.attack(mostHurt);
  };

  TickCreep(creep: CreepExtra, room: RoomExtra): void {
    creep.notifyWhenAttacked(false); // Ignore attack notifications for Attackers.
    this.HealHurtAllies(creep);
    this.AttackEnemies(creep);
  }

  override GetInitialTask(room: RoomExtra): CreepTask | null {
    const curr = this.GetCurrentStep();
    if (!curr) return null;
    if (!curr.memory.attackType) return null;

    // If room is not visible, or next step is a rally, do a move.
    if (!(curr.pos.roomName in Game.rooms) || curr.memory.attackType === "Rally")
      return new Move(curr.pos, this.RallyDistance - 1);

    // If next step is Dismantle, find the target structure, and set to dismantling it
    if (curr.memory.attackType === "NearestStructure") {
      const structure = curr.pos.lookFor(LOOK_STRUCTURES).pop();
      if (!structure) return new Idle(`no structs!`);
      return new Dismantle(structure.id);
    }

    return null;
  }
  override GetGlobalQuota(): number { return this.AttackSize; }
  override GetRoomQuota(room: RoomExtra): number { return this.AttackSize; }
  IsSpawnNeeded(room: RoomExtra): boolean { return this.GetCurrentStep() != null; }
  SelectNextTask(creep: CreepExtra, room: RoomExtra, lastTask: CreepTask | null): CreepTask | null {
    const nextTask = this.GetInitialTask(room);
    // Ignore Move if it's the same
    if (
      lastTask != null
      && nextTask != null
      && nextTask.action === TaskAction.Move
      && lastTask.action === TaskAction.Move
      && (nextTask as Move).target.x === (lastTask as Move).target.x
      && (nextTask as Move).target.y === (lastTask as Move).target.y
      && (nextTask as Move).target.roomName === (lastTask as Move).target.roomName
    ) return null;
    else return nextTask;
  }
}
