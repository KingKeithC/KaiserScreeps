import { CreepExtra } from "Creep";
import { Nouns, Adjectives } from "Data";
import { RoomExtra } from "Room";

export type RoomRoleType = {
  readonly RoleName: string;
  new(manager: RoomExtra): RoomRole<any>;
};

export abstract class RoomRole<MemoryShape extends Object> {
  static readonly Registry = new Map<string, RoomRoleType>();

  static Register<T extends RoomRoleType>(roleType: T): T {
    RoomRole.Registry.set(roleType.RoleName, roleType);
    return roleType;
  }

  abstract BodyParts: BodyPartConstant[];
  abstract InitialJobMemory: MemoryShape;

  protected room: RoomExtra;
  constructor(room: RoomExtra) { this.room = room; }

  get RoleName(): string { return (this.constructor as RoomRoleType).RoleName }
  TickStart(): void { }
  abstract TickCreep(creep: CreepExtra, task: MemoryShape): void;
  TickEnd(): void { }

  // -1 for unlimited
  private _GlobalCount: number = -1;
  public get GlobalCount(): number {
    return this._GlobalCount;
  }
  public set GlobalCount(value: number) {
    this._GlobalCount = value;
  }
  private _CountPerRoom: number = -1;
  public get CountPerRoom(): number {
    return this._CountPerRoom;
  }
  public set CountPerRoom(value: number) {
    this._CountPerRoom = value;
  }

  // RCL Ranges to constrain role spawns
  StartSpawnAtRCL: number = 1;
  StopSpawnAtRCL: number = 100;

  // How ofter to check for spawn
  SpawnRate: number = 120;
  SpawnTickOffet: number = 0;

  CreepsInRole(): CreepExtra[] {
    return this.room.find(FIND_MY_CREEPS, {
      filter: c => c.memory.room === this.room.name && c.memory.role === this.RoleName
    })
  }

  TickRole(): void {
    // Check to do spawns every `this.SpawnRate` ticks.
    const timeSinceLastSpawn = Game.time - (this.room.memory.lastSpawnTick[this.RoleName] ?? 0) - this.SpawnTickOffet;
    if (timeSinceLastSpawn > this.SpawnRate || this.room.find(FIND_MY_CREEPS).length === 0) {
      this.DoSpawns();
      this.room.memory.lastSpawnTick[this.RoleName] = Game.time; // Reset
    }

    for (const creep of this.room.find(FIND_MY_CREEPS,
      { filter: c => c.memory.room === this.room.name && c.memory.role === this.RoleName })
      .map(c => new CreepExtra(c.id))
    ) {
      var task = creep.memory.jobMemory as MemoryShape;
      if (task == null || task == undefined) {
        console.log(`${this.room}${creep} TickRole: CreepExtra has invalid memory. Wiping...`);
        task = this.InitialJobMemory;
        creep.memory.jobMemory = task;
      }

      if (!creep.spawning)
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
    const rcl = this.room.controller?.level;
    if (!rcl || rcl < this.StartSpawnAtRCL || rcl >= this.StopSpawnAtRCL) {
      console.log(`${this.room}[${this.RoleName}]: RCL (${rcl}) is outside spawn requirements (${this.StartSpawnAtRCL} <= RCL < ${this.StopSpawnAtRCL})`);
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

    // determine room quota, from class by default, or memory if set there
    var roomQuota = this.CountPerRoom;
    if (this.room.memory.quotas && this.room.memory.quotas[this.RoleName])
      roomQuota = this.room.memory.quotas[this.RoleName];

    // or room quota met
    const roomCount = this.CreepsInRole().length;
    if (roomCount >= roomQuota) {
      console.log(`${this.room}[${this.RoleName}]: Room Quota Met ${roomCount}/${roomQuota}`);
      return;
    }

    // or there isn't enough energy
    const cost = CreepExtra.BodyCost(this.BodyParts);
    if (this.room.energyAvailable < cost) {
      console.log(`${this.room}[${this.RoleName}]: Need to spawn (${roomCount}/${roomQuota}), but lack the energy (costs ${cost}, have ${this.room.energyAvailable}/${this.room.energyCapacityAvailable})...`);
      return;
    }

    // or the subclass decides not to
    if (!this.CanSpawn()) {
      console.log(`${this.room}[${this.RoleName}]: Need to spawn (${roomCount}/${roomQuota}), but CanSpawn() said no...`);
      return;
    }

    // Find a suitable spawn point
    const possibleSpawns = this.FindSpawns();
    if (possibleSpawns.length === 0) {
      console.log(`${this.room}[${this.RoleName}]: Need to spawn (${roomCount}/${roomQuota}), but no points could be found.`);
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
        console.log(`${this.room}[creep ${newName}]: (${roomCount}+1/${roomQuota}) Spawning @ ${spawnPoint.name}...`);
        return; // Successful, no need to proceed.
      }
      console.log(`${this.room}[creep ${newName}]: (${roomCount}/${roomQuota}) Unable to spawn at ${spawnPoint} due to: ${result}...`);
    }
    console.log(`${this.room}[creep ${newName}]: All spawn attempts failed... woe is me for I did not experience life :(`);
  }

  // Can be overridden to provide an opportunity to intercept spawns.
  CanSpawn(): boolean {
    return true;
  }
}
