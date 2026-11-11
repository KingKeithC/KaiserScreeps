import { groupBy } from 'lodash';
import { Filters, RoomPositionString, SerializeRoomPosition, SerializeRoomPositionTriple } from './Collections';
import { BodyCost, PartCounts } from './CreepUtils';
import { Logger } from './Logger';

/*

  Standalone Functions/Types related to rooms.

*/

// GenericStoreBase rather than StoreDefinition so unlimited stores (ruins, tombstones) also match.
export type StoreTargetable = _HasId & _HasRoomPosition & { store: GenericStoreBase };
export type ResourceContainer = StoreTargetable | Resource;

// getUsedCapacity returns null only for resources the store type does not hold.
export type StoreAmount = NonNullable<ReturnType<GenericStoreBase['getUsedCapacity']>>;

export type ContainerAndAmount = [ResourceContainer, StoreAmount];

/* ------------- Interfaces ------------- */

export interface HostileInfo {
  type: 'creep' | BuildableStructureConstant;
  id: Id<_HasId & _HasRoomPosition>;
  ownerUsername: string;
  pos: RoomPositionString;
  bodyCost?: number;
  partCounts?: { [part: string]: number };
}

// A single Mining Position
export interface MiningPosition {
  source: Id<Source> | Id<StructureExtractor>;
  pos: RoomPositionString;
  priority: 1 | 2 | 3;
}

export function isEqualTo(a: MiningPosition, b: MiningPosition): boolean {
  return a.pos === b.pos && a.source === b.source;
}

interface MineralInfo {
  id: Id<Mineral>;
  density: DensityConstant;
  mineralAmount: number;
  mineralType: MineralConstant;
  ticksToRegeneration?: number | undefined;
}

interface DepositInfo {
  id: Id<Deposit>;
  depositType: DepositConstant;
  cooldown: number;
  lastCooldown: number;
  ticksToDecay: number;
}

export interface RoomReport {
  roomName: string;
  lastSeen: number;
  hasController: boolean;
  numberOfSources: number;
  mines: MiningPosition[];
  status: RoomStatus;
  describeExits: Partial<Record<ExitKey, string>> | null;
  owner?: string;
  reservation?: ReservationDefinition;
  mineral?: MineralInfo;
  deposit?: DepositInfo;
  hostiles?: HostileInfo[];
}

/* ------------- Functions ------------- */

/**
 * Given a room, return a hostile info object for each hostile looking thing inside of it.
 * The list contains details about each non-neutral structure or creep not owned by us.
 * @param room The room to search in, must be visible.
 * @returns A homogenous list of hostile info.
 */
export function GetHostileInfo(room: Room): HostileInfo[] {
  const hostileCreeps = room
    .find(FIND_HOSTILE_CREEPS)
    .map(c => ({
      type: 'creep' as const,
      id: c.id,
      ownerUsername: c.owner.username,
      pos: SerializeRoomPosition(c.pos),
      bodyCost: BodyCost(c.body.map(p => p.type)),
      partCounts: PartCounts(c.body),
    }));

  const hostileStructures: HostileInfo[] = room
    .find(FIND_HOSTILE_STRUCTURES)
    .map(s => ({
      type: s.structureType as BuildableStructureConstant,
      id: s.id,
      ownerUsername: s.owner ? s.owner.username : '<unowned>',
      pos: SerializeRoomPosition(s.pos),
    }));

  return [...hostileCreeps, ...hostileStructures];
}

/**
 * Convert a list of hostile infos to a single line, ideal for logging.
 * @param infos A list of Hostile Info objects.
 * @returns A single compressed string suitable for logging.
 */
export function FormatHostileInfos(infos: HostileInfo[]): string {
  let report = '';
  const hostilesByOwner = groupBy(infos, h => h.ownerUsername);
  for (const owner in hostilesByOwner) {
    const structures = hostilesByOwner[owner].filter(h => h.type !== 'creep');
    const structureDetail = Object.entries(groupBy(structures, h => h.type)).reduceRight(
      (acc, e) => `${e[0]}: ${e[1].length}, ${acc}`,
      '',
    );
    report += `[${owner}: ${hostilesByOwner[owner].filter(h => h.type === 'creep').length} Creeps, ${structures.length} Structures: {${structureDetail}}]`;
  }
  return report;
}

/**
 * Fast Test to check if a creep would be able to stand on an arbitrary room position.
 * Meant for use in loops over an area.
 *
 * @param x 0-49
 * @param y 0-49
 * @param room The room we are checking in.
 * @param terrain A reference to the room's terrain (if you already have one available).
 * @returns `true` if a Creep would be able to stand on the given position.
 */
export function IsWalkable(x: number, y: number, room: Room, terrain: RoomTerrain = room.getTerrain()): boolean {
  // Get a reference to the actual position
  const pos = room.getPositionAt(x, y);

  // Can't stand on invalid positions.
  if (!pos) return false;

  // Can't stand on walls
  if (terrain.get(x, y) === TERRAIN_MASK_WALL) return false;

  for (const structure of pos.lookFor(LOOK_STRUCTURES)) {
    if (Filters.NonWalkableStructure(structure)) return false;
  }

  for (const structure of pos.lookFor(LOOK_CONSTRUCTION_SITES)) {
    if (Filters.NonWalkableStructure(structure)) return false;
  }

  // No other blockers, must be okay to stand there
  return true;
}

export function GetMineable(room: Room): (Source | StructureExtractor)[] {
  const sources: (Source | StructureExtractor)[] = room.find(FIND_SOURCES);
  if (CONTROLLER_STRUCTURES.extractor[room.controller?.level ?? 0] > 0)
    for (const extractor of room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_EXTRACTOR } }))
      if (typeof extractor.isActive === 'function' && extractor.isActive()) {
        const mineral = extractor.pos.lookFor(LOOK_MINERALS).pop();
        if (!mineral || mineral.mineralAmount === 0) continue;
        sources.push(extractor as StructureExtractor);
      }

  return sources;
}

/**
 * For each source in the room, find all the positions around it that a miner could occupy.
 * @param room The room to search in, must be visible.
 * @returns A list of Mining Positions, that are readily serializable.
 */
export function GetMiningPositions(room: Room): MiningPosition[] {
  const sources = GetMineable(room);
  if (sources.length === 0) {
    Logger.warn('GetMinerPositions: No sources/extractors in room.', { '<room>': room });
  }

  let searched = 0;
  const terrain = room.getTerrain();
  const miningPositions = [];

  // Find all walkable positions around each mineable source or extractor.
  for (const s of sources)
    // Given the source.pos is the centre point
    // get the positions of all the surrounding spaces
    for (let x = s.pos.x - 1; x <= s.pos.x + 1; x++)
      for (let y = s.pos.y - 1; y <= s.pos.y + 1; y++) {
        searched++;
        if (x === s.pos.x && y === s.pos.y) continue; // Skip centre point
        if (IsWalkable(x, y, room, terrain)) {
          // Must be a valid spot for a creep to sit
          const position = room.getPositionAt(x, y);
          if (!position) continue;
          const structures = position.lookFor(LOOK_STRUCTURES);

          // Rank positions by priority:
          // If the position has a container on it, 1
          // Else if it is not on a road, 2
          // Else, 3
          const priority: MiningPosition['priority'] = structures.some(
            structure => structure.structureType === STRUCTURE_CONTAINER,
          )
            ? 1
            : structures.some(structure => structure.structureType === STRUCTURE_ROAD)
              ? 3
              : 2;

          miningPositions.push({ source: s.id, pos: SerializeRoomPositionTriple(x, y, room.name), priority });
        }
      }

  Logger.info('Found mineable positions.', { '<room>': room, searched, sources });
  return miningPositions;
}

/**
 * Given a visible room, generate a report of all the interesting things in it.
 * Meant to be used as the basis for a scouting report.
 * @param rRoom The room being scouted, must be visible.
 * @returns A serializable report of the interesting things in the room.
 */
export function MakeRoomReport(rRoom: Room): RoomReport {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const minerals = rRoom.find(FIND_MINERALS);
  if (minerals.length > 1)
    Logger.crit('Room has more than one mineral to harvest.', { '<room>': rRoom, mineralCount: minerals.length });
  const mineral = minerals.pop();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const deposits = rRoom.find(FIND_DEPOSITS);
  if (deposits.length > 1)
    Logger.crit('Room has more than one commodity deposit.', { '<room>': rRoom, depositCount: deposits.length });
  const deposit = deposits.pop();

  return {
    roomName: rRoom.name,
    lastSeen: Game.time,
    hasController: rRoom.controller !== undefined,
    numberOfSources: rRoom.find(FIND_SOURCES).length,
    mines: GetMiningPositions(rRoom),
    status: Game.map.getRoomStatus(rRoom.name),
    describeExits: Game.map.describeExits(rRoom.name),
    owner: rRoom.controller?.owner?.username,
    reservation: rRoom.controller?.reservation,
    mineral: mineral
      ? {
          id: mineral.id,
          density: mineral.density,
          mineralAmount: mineral.mineralAmount,
          mineralType: mineral.mineralType,
          ticksToRegeneration: mineral.ticksToRegeneration,
        }
      : undefined,
    deposit: deposit
      ? {
          id: deposit.id,
          cooldown: deposit.cooldown,
          depositType: deposit.depositType,
          lastCooldown: deposit.lastCooldown,
          ticksToDecay: deposit.ticksToDecay,
        }
      : undefined,
    hostiles: GetHostileInfo(rRoom),
  };
}

export function FirstBodyByEnergyCapacity(
  room: Room,
  ...bodies: (BodyPartConstant[] | null | undefined)[]
): BodyPartConstant[] | null {
  for (const body of bodies) if (body && room.energyCapacityAvailable >= BodyCost(body)) return body;
  return null;
}

export function FirstBodyByEnergyAvailable(
  room: Room,
  ...bodies: (BodyPartConstant[] | null | undefined)[]
): BodyPartConstant[] | null {
  for (const body of bodies) if (body && room.energyAvailable >= BodyCost(body)) return body;
  return null;
}

export function GetMinesForRoom(room: Room | string, myUsername: string): MiningPosition[] {
  Memory.scoutingReports ??= {};

  let existingReport;
  if (typeof room === 'string') {
    // Not owned, and not visible room.

    // Lookup the existing report for the room, and
    // if the report has mines, and the room is neutral,
    // then return those mines.
    existingReport = Memory.scoutingReports[room];

    // No fallback for these since the room is not visible
    if (!existingReport || !existingReport.mines) {
      Logger.warn('No existing scouting report or mines found for room.', { room });
      return [];
    }

    // Don't return mines for hostile rooms, since we can
    // only mine neutral or owned rooms.
    if (existingReport.owner !== undefined && existingReport.owner !== myUsername) {
      Logger.warn('Room is currently hostile, skipping mining positions.', { room, existingReport });
      return [];
    }

    return existingReport.mines;
  }

  // Verify the room is actually a room and not a string
  if (!room || (room && !(room instanceof Room))) {
    Logger.warn('Room is falsy or not an instance of Room or string.', { room });
    return [];
  }

  // Not an owned room
  // Get mines from the room's scouting report, and if there is
  // no scouting report, create a new one and return the mines from that.

  // Lookup report
  existingReport = Memory.scoutingReports[room.name];

  // Check if the room is hostile and return empty before proceeding
  if (
    room.name in Game.rooms &&
    room.controller &&
    room.controller.owner &&
    room.controller.owner.username !== myUsername
  ) {
    Logger.warn('Room is currently hostile, skipping mining positions.', {
      '<room>': room,
      currentControllerUsername: room.controller.owner.username,
    });
    return [];
  } else if (existingReport && existingReport.owner !== undefined && existingReport.owner !== myUsername) {
    Logger.warn('Room is currently hostile, skipping mining positions.', {
      '<room>': room,
      reportedControllerUsername: existingReport.owner,
    });
    return [];
  }

  // Quick return if existing report has mines
  if (existingReport !== undefined && existingReport.mines !== undefined && existingReport.mines.length > 0)
    return existingReport.mines;

  // Otherwise, we have to make a new report and return the mines from that
  if (existingReport === undefined) {
    // Whole report needs to be replaced
    const report = MakeRoomReport(room);
    Memory.scoutingReports[room.name] = report;
    return report.mines;
  } else {
    // Just the mines section needs to be replaced
    const mines = GetMiningPositions(room);
    Memory.scoutingReports[room.name].mines = mines;
    return mines;
  }
}
