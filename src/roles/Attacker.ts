import { CreepExtra } from 'Creep';
import { CreepTask, Move, Dismantle } from 'tasks';
import { Attack } from 'tasks/Attack';
import { MakeBody, FormatStructureHits, SerializeRoomPosition } from 'utils/Collections';
import { BodyCost, PartCounts } from 'utils/CreepUtils';
import { FormatHostileInfos } from 'utils/RoomUtils';
import { CreepRoleBase, CreepRole } from './Role';

type AttackType = 'Rally' | 'NearestStructure' | 'Creeps';

declare global {
  interface FlagMemory {
    attackIndex?: number;
    attackType?: AttackType;
    done?: boolean;
  }
}

export class Attacker extends CreepRoleBase implements CreepRole {
  readonly groupName = 'Warriors';
  readonly name = 'Attacker';

  RallyDistance = 2;
  AttackSize = 3;

  GetNewCreepBody(): BodyPartConstant[] {
    return MakeBody([MOVE, 5], [WORK, 6], [ATTACK, 2], [HEAL, 1]);
  }

  GetAttackPlan(): Flag[] {
    const flags = Object.values(Game.flags).filter(f => f.name.startsWith('Attack') && f.name.includes(':'));
    for (const f of flags) {
      // Set initial memory for flags based on name
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_, index, action] = f.name.split(':');
      f.memory.attackIndex ??= Number.parseInt(index, 10);
      f.memory.attackType ??= action as AttackType;
      f.memory.done ??= false;
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return flags.sort((a, b) => a.memory.attackIndex! - b.memory.attackIndex!);
  }

  // Return the first step in the sequence that is not complete
  GetCurrentStep(): Flag | null {
    for (const step of this.GetAttackPlan()) if (!step.memory.done) return step;
    return null;
  }

  GetLastStep(): Flag | null {
    const allSteps = this.GetAttackPlan();
    const next = this.GetCurrentStep();
    if (!next || allSteps.length < 2) return null;
    const idx = allSteps.indexOf(next);
    return allSteps[idx - 1];
  }

  EndOfTick(): void {
    const curr = this.GetCurrentStep();
    if (curr) this.SetStepCompletion(curr);
  }

  SetStepCompletion(step: Flag): void {
    if (!(step.pos.roomName in Game.rooms)) {
      // Step is no longer accessible, mark as incomplete
      if (Game.time % 10 === 0)
        this.log.info(`Attack Step ${step.name} in progress, traveling to ${step.pos.roomName}...`);
      step.memory.done = false;
      return;
    } else if (step.memory.attackType === 'Rally') {
      // Rally step is complete when enough attackers in range to rally site
      const found = step.pos.findInRange(this.GetGlobalCreepsInRole(), this.RallyDistance + 1);
      if (found.length >= this.AttackSize) {
        this.log.warn(`Rally Step ${step.name} completed.`);
        step.memory.done = true;
        return;
      } else {
        if (Game.time % 10 === 0)
          this.log.info(
            `Attack ${step.memory.attackIndex}: ${step.memory.attackType} (${found.length}/${this.AttackSize})...`,
          );
        step.memory.done = false;
        return;
      }
    } else if (step.memory.attackType === 'NearestStructure') {
      // NearestStructure is complete when
      const nearby = step.pos.lookFor(LOOK_STRUCTURES).pop();
      if (!nearby) {
        this.log.warn(`Attack ${step.memory.attackIndex}: ${step.memory.attackType} completed.`);
        step.memory.done = true;
        return;
      } else {
        if (Game.time % 10 === 0) {
          this.log.info(
            `Attack ${step.memory.attackIndex}: ${step.memory.attackType} in progress on (${nearby}), ${FormatStructureHits(nearby)}...`,
          );
        }
        step.memory.done = false;
        return;
      }
    } else if (
      step.memory.attackType === 'Creeps' ||
      step.memory.attackType === '' ||
      step.memory.attackType === undefined
    ) {
      // Default is to attack nearby creeps
      const nearby = step.pos.findInRange(FIND_HOSTILE_CREEPS, 3).pop();
      if (!nearby) {
        this.log.warn(`Attack ${step.memory.attackIndex}: Creeps completed.`);
        step.memory.done = true;
        return;
      } else {
        if (Game.time % 10 === 0)
          this.log.info(
            `Attack ${step.memory.attackIndex}: ${step.memory.attackType} in progress on (${nearby}), ${FormatHostileInfos(
              [
                {
                  type: 'creep',
                  id: nearby.id,
                  ownerUsername: nearby.owner.username,
                  pos: SerializeRoomPosition(nearby.pos),
                  bodyCost: BodyCost(nearby.body.map(p => p.type)),
                  partCounts: PartCounts(nearby.body),
                },
              ],
            )}...`,
          );
        step.memory.done = false;
        return;
      }
    }
  }

  HealHurtAllies(creep: CreepExtra): void {
    // Heal whoever in range is the most hurt
    const hurtAllies = creep.pos.findInRange(FIND_MY_CREEPS, 3, { filter: c => c.hits < c.hitsMax });
    const mostHurt = hurtAllies.sort((b, a) => a.hits / a.hitsMax - b.hits / b.hitsMax).pop();
    if (mostHurt && creep.pos.getRangeTo(mostHurt) === 1) creep.heal(mostHurt);
    else if (mostHurt) creep.rangedHeal(mostHurt);
  }

  AttackEnemies(creep: CreepExtra): void {
    const hurtEnemies = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 1);
    const mostHurt = hurtEnemies.sort((b, a) => a.hits / a.hitsMax - b.hits / b.hitsMax).pop();
    if (mostHurt) creep.attack(mostHurt);
  }

  public OnSpawn(creep: CreepExtra): void {
    creep.notifyWhenAttacked(false);
  }

  TickCreep(creep: CreepExtra): void {
    this.HealHurtAllies(creep);
    this.AttackEnemies(creep);
  }

  override GetRoomQuota(): number {
    return this.AttackSize;
  }
  IsSpawnNeeded(): boolean {
    return this.GetCurrentStep() != null;
  }
  SelectNextTask(): CreepTask | null {
    const curr = this.GetCurrentStep();
    if (!curr) return null;

    // If room is not visible, or next step is a rally, do a move.
    if (!(curr.pos.roomName in Game.rooms) || curr.memory.attackType === 'Rally')
      return new Move(curr.pos, this.RallyDistance - 1);

    // If next step is Dismantle, find the target structure, and set to dismantling it
    if (curr.memory.attackType === 'NearestStructure') {
      const structure = curr.pos.lookFor(LOOK_STRUCTURES).pop();
      if (!structure) return null;
      return new Dismantle(structure.id);
    }

    if (curr.memory.attackType === 'Creeps' || curr.memory.attackType === '' || curr.memory.attackType === undefined) {
      for (const nearby of curr.pos.findInRange(FIND_HOSTILE_CREEPS, 3)) {
        if (!nearby) return null;
        return new Attack(nearby);
      }
    }

    return null;
  }
}
