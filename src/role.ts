import { CreepExtra } from "creep";
import { Nouns, Adjectives, Colours } from "data";

export abstract class RoomRole<MemoryShape extends Object> {
  abstract RoleName: string;
  abstract BodyParts: BodyPartConstant[];
  abstract InitialJobMemory: MemoryShape;
  abstract CountPerRoom: number;

  readonly room: Room;
  constructor(room: Room) { this.room = room; }

  // Cached fields generated on first access.
  private _CreepsInRole?: CreepExtra[];
  get CreepsInRole(): CreepExtra[] {
    if (!this._CreepsInRole) this._CreepsInRole = CreepExtra.FindWithRole(this.RoleName);
    return this._CreepsInRole;
  }

  private _CreepsInRoomAndRole?: CreepExtra[];
  get CreepsInRoomAndRole(): CreepExtra[] {
    if (!this._CreepsInRoomAndRole) this._CreepsInRoomAndRole = this.CreepsInRole.filter(c => c.memory.room == this.room.name);
    return this._CreepsInRoomAndRole;
  }

  GlobalCount: number = -1; // -1 for unlimited

  // RCL Ranges to constrain role spawns
  StartSpawnAtRCL: number = 1;
  StopSpawnAtRCL: number = 100;

  // How ofter to check for spawn
  SpawnRate: number = 120;


  ReusePath: number = 10;
  MaxStuckTicks: number = 2;
  MaxAvoidTicks: number = 3;

  TickStart(): void { }
  abstract TickCreep(creep: CreepExtra, task: MemoryShape): void;
  TickEnd(): void { }

  protected RoleBodyCost(): number {
    var total: number = 0;
    for (const part of this.BodyParts) total += BODYPART_COST[part];
    return total;
  }

  TickRoom(): void {
    this.TickStart();

    // Check to do spawns every `this.SpawnRate` ticks.
    if (Game.time - (this.room.memory.lastSpawnTick[this.RoleName] ?? 0) > this.SpawnRate) {
      this.DoSpawns();
      this.room.memory.lastSpawnTick[this.RoleName] = Game.time; // Reset
    }

    for (const creep of this.CreepsInRoomAndRole) {
      var task = creep.memory.jobMemory as MemoryShape;
      if (task == null || task == undefined) {
        console.log(`${this.room}${creep} TickRole: CreepExtra has invalid memory. Wiping...`);
        task = this.InitialJobMemory;
        creep.memory.jobMemory = task;
      }

      this.TickCreep(creep, task);

      const ttl = creep.ticksToLive ?? 100;
      if (ttl === 2)
        creep.say("☠️", true);
      else if (ttl === 3)
        creep.say("🤡", true);
      else if (ttl === 4)
        creep.say("🫲☹️🫱💔🫂", true);
      else if (ttl === 5)
        creep.say("😭🙏", true);
      else if (ttl === 10)
        creep.say("😰", true);
      else if (ttl === 15)
        creep.say("😨", true);
    }
    this.TickEnd();
  }

  GetRandomSuffix() {
    const adj1 = Adjectives[Math.floor(Math.random() * Adjectives.length)];
    const adj2 = Adjectives[Math.floor(Math.random() * Adjectives.length)];
    const noun = Nouns[Math.floor(Math.random() * Nouns.length)];
    return [adj1, adj2, noun].join("-");
  }

  FindSpawns(): StructureSpawn[] {
    return this.room.find(FIND_MY_SPAWNS, { filter: (spawn) => !spawn.spawning });
  }

  DoSpawns(): void {
    // Delete memory of missing creeps before doing spawns
    for (const name in Memory.creeps) {
      if (!(name in Game.creeps)) {
        console.log(`Cleanup memory for ${name}`);
        delete Memory.creeps[name];
      }
    }

    // Cannot spawn if RCL is wrong
    const rcl = this.room.controller?.level ?? 0;
    if (rcl < this.StartSpawnAtRCL || rcl >= this.StopSpawnAtRCL) {
      console.log(`${this.room}[${this.RoleName}]: RCL (${rcl}) is outside spawn requirements (${this.StartSpawnAtRCL} <= RCL < ${this.StopSpawnAtRCL}`);
      return;
    };

    // or global quota met if there is one
    if (this.GlobalCount >= 0) {
      const globalCount = this.CreepsInRole.length;
      if (globalCount >= this.GlobalCount) {
        console.log(`[${this.RoleName}]: Global Quota Met ${globalCount}/${this.GlobalCount}`);
        return;
      }
    }

    // or room quota met
    const roomCount = this.CreepsInRoomAndRole.length;
    if (roomCount >= this.CountPerRoom) {
      console.log(`${this.room}[${this.RoleName}]: Room Quota Met ${roomCount}/${this.CountPerRoom}`);
      return;
    }

    // or a spawn is already in progress
    if (this.room.find(FIND_MY_SPAWNS, { filter: (s) => s.spawning }).length) {
      console.log(`${this.room}[${this.RoleName}]: Need to spawn (${roomCount}/${this.CountPerRoom}), but another spawn is in progress.`);
      return;
    }

    // or there isn't enough energy
    if (this.room.energyAvailable < this.RoleBodyCost()) {
      console.log(`${this.room}[${this.RoleName}]: Need to spawn (${roomCount}/${this.CountPerRoom}), but lack the energy (costs ${this.RoleBodyCost()}, have ${this.room.energyAvailable}/${this.room.energyCapacityAvailable})...`);
      return;
    }

    // Find a suitable spawn point
    const possibleSpawns = this.FindSpawns();
    if (possibleSpawns.length === 0) {
      console.log(`${this.room}[${this.RoleName}]: Need to spawn (${this.CreepsInRoomAndRole.length}/${this.CountPerRoom}), but no points could be found.`);
      return;
    }

    const newName = `${this.RoleName}-${this.GetRandomSuffix()}`;
    for (const spawnPoint of possibleSpawns) {
      // Try to do the spawn
      const result = spawnPoint.spawnCreep(
        this.BodyParts,
        newName,
        {
          memory: {
            room: this.room.name,
            role: this.RoleName,
            stuckTicks: 0,
            lastPos: { x: spawnPoint.pos.x, y: spawnPoint.pos.y },
            jobMemory: this.InitialJobMemory,
          },
        }
      );

      // Log the result

      if (result === OK) {
        console.log(`${this.room}[creep ${newName}]: (${roomCount}+1/${this.CountPerRoom}) Spawning @ ${spawnPoint.name}...`);
        return; // Successful, no need to proceed.
      }
      console.log(`${this.room}[creep ${newName}]: (${roomCount}/${this.CountPerRoom}) Unable to spawn at ${spawnPoint} due to: ${result}...`);
    }
    console.log(`${this.room}[creep ${newName}]: All spawn attempts failed... woe is me for I did not experience life :(`);
  }
}
