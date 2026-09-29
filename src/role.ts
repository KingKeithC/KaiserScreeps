import { min } from "lodash";
import { COLOURS } from "utils/Colours";

export abstract class Role {
  abstract RoleName: string;

  protected room: Room;

  constructor(room: Room) {
    this.room = room;
  }

  // How many creeps to have per room in this role
  abstract CountPerRoom: number;

  // Body for creeps spawned of this role
  abstract BodyParts: BodyPartConstant[];

  // RCL Ranges to constrain role
  SpawnAtRCL: number = 0;
  StopSpawnAtRCL: number = 100;

  // How ofter to check for spawn
  SpawnRate: number = 80;

  InitialJobMemory: object = {}

  ReusePath: number = 20;
  ShortPathThreshold: number = 6;

  abstract Tick(): void;

  protected RoleBodyCost(): number {
    var total: number = 0;
    for (const part of this.BodyParts) total += BODYPART_COST[part];
    return total;
  }

  protected CreepsInRole = () => this.room.find(FIND_MY_CREEPS, { filter: (creep) => creep.memory.role === this.RoleName });

  DoSpawns(): void {
    const timeSinceSpawn = Game.time - (this.room.memory.lastSpawnTick[this.RoleName] ?? 0);
    if (timeSinceSpawn < this.SpawnRate) return; // Not ready
    this.room.memory.lastSpawnTick[this.RoleName] = Game.time; // Reset

    // Cannot spawn if RCL is wrong
    const rcl = this.room.controller?.level ?? 0;
    if (rcl < this.SpawnAtRCL || rcl >= this.StopSpawnAtRCL) {
      console.log(`${this.room}[${this.RoleName}]: RCL (${rcl}) LT ${this.SpawnAtRCL} or GE ${this.StopSpawnAtRCL}`);
      return;
    };

    // or quota met
    const current = this.CreepsInRole().length;
    if (current >= this.CountPerRoom) {
      console.log(`${this.room}[${this.RoleName}]: ${Game.time} Quota Met ${current}/${this.CountPerRoom}`);
      return;
    }

    // or a spawn is already in progress
    if (this.room.find(FIND_MY_SPAWNS, { filter: (s) => s.spawning }).length) {
      console.log(`${this.room}[${this.RoleName}]: Another spawn is in progress.`);
      return;
    }

    // or there isn't enough energy
    if (this.room.energyAvailable < this.RoleBodyCost()) {
      console.log(`${this.room}[${this.RoleName}]: Need to spawn, but lack the energy (costs ${this.RoleBodyCost()}, have ${this.room.energyAvailable}/${this.room.energyCapacityAvailable})...`);
      return;
    }

    // Find a suitable spawn point
    const spawns = this.room.find(FIND_MY_SPAWNS, { filter: (spawn) => !spawn.spawning });
    if (spawns.length === 0) {
      console.log(`${this.room}[${this.RoleName}]: Need to spawn, but no points are available or all are in use.`);
      return;
    }
    const spawnPoint = spawns[0];

    // Do the spawn
    const result = spawnPoint.spawnCreep(
      this.BodyParts,
      `${this.RoleName}-${Game.time}`,
      {
        memory: {
          room: this.room.name,
          role: this.RoleName,
          jobMemory: this.InitialJobMemory,
        },
      }
    );

    // Log the result
    if (result === OK)
      console.log(`${this.room}[${this.RoleName}]: ${this.CreepsInRole().length}/${this.CountPerRoom} +1 Spawning @ ${spawnPoint}...`);
    else
      console.log(`${this.room}[${this.RoleName}]: ${spawnPoint} Spawn failed with result: ${result}...`);
  }

  MoveCreep(creep: Creep, target: RoomPosition, minRange: number = 3): number | null {
    // Can't move anyways so don't bother
    if (creep.fatigue) return ERR_TIRED;

    const range = creep.pos.getRangeTo(target);

    // Close enough we shouldn't need to move
    if (range <= minRange) return null;

    var moveOutcome: number = OK;
    if (range > this.ShortPathThreshold)
      // Move Long if we are farther than ShortPathThreshold away.
      moveOutcome = creep.moveTo(target, { visualizePathStyle: { stroke: COLOURS.PATH_LONG, lineStyle: "solid" }, range: minRange, reusePath: this.ReusePath, ignoreCreeps: true });
    else
      // Move Short otherwise
      moveOutcome = creep.moveTo(target, { visualizePathStyle: { stroke: COLOURS.PATH_SHORT, lineStyle: "dotted" }, range: minRange, maxOps: 300 });

    return moveOutcome;
  }
}
