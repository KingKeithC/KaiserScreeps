import { groupBy } from 'lodash';
import { RoomPositionString, SerializeRoomPosition, SerializeRoomPositionTriple } from './Collections';
import { BodyCost as CrrepBodyCost, PartCounts as CreepBodypartCounts } from './CreepUtils';
import { Logger } from './Logger';

/*

  Standalone Functions/Types related to rooms.

*/

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
  source: Id<Source>;
  pos: RoomPositionString;
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
      bodyCost: CrrepBodyCost(c.body.map(p => p.type)),
      partCounts: CreepBodypartCounts(c.body),
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
export function CouldCreepStandAt(x: number, y: number, room: Room, terrain: RoomTerrain = room.getTerrain()): boolean {
  // Get a reference to the actual position
  const pos = room.getPositionAt(x, y);

  // Can't stand on invalid positions.
  if (!pos) return false;

  // Can't stand on walls
  if (terrain.get(x, y) === TERRAIN_MASK_WALL) return false;

  for (const structure of pos.lookFor(LOOK_STRUCTURES)) {
    if (structure.structureType === STRUCTURE_CONTAINER) continue; // Can stand on containers.
    if (structure.structureType === STRUCTURE_ROAD) continue; // Can stand on roads.
    if (structure.structureType === STRUCTURE_RAMPART && structure.my) continue; // Can stand on my ramparts.
    return false; // Can't stand on any other structure
  }

  // Can't stand on construction sites (or maybe just shouldn't)
  if (pos.lookFor(LOOK_CONSTRUCTION_SITES).length > 0) return false;

  // No other blockers, must be okay to stand there
  return true;
}

/**
 * For each source in the room, find all the positions around it that a miner could occupy.
 * @param room The room to search in, must be visible.
 * @returns A list of Mining Positions, that are readily serializable.
 */
export function GetMiningPositions(room: Room): MiningPosition[] {
  const sources = room.find(FIND_SOURCES);
  if (sources.length === 0) {
    Logger.warn(`GetMinerPositions: No sources in room.`, { '<room>': room });
  }

  let searched = 0;
  let found = 0;
  const terrain = room.getTerrain();
  const ret = [];

  for (const s of sources)
    // Given the source.pos is the centre point
    // get the positions of all the surrounding spaces
    for (let x = s.pos.x - 1; x <= s.pos.x + 1; x++)
      for (let y = s.pos.y - 1; y <= s.pos.y + 1; y++) {
        searched++;
        if (x === s.pos.x && y === s.pos.y) continue; // Skip centre point
        if (CouldCreepStandAt(x, y, room, terrain)) {
          // Must be a valid spot for a creep to sit
          ret.push({ source: s.id, pos: SerializeRoomPositionTriple(x, y, room.name) });
          found++;
        }
      }

  Logger.info(`GetMinerPositions: ${sources.length} Sources have ${found} positions (${searched} searched).`, {
    '<room>': room,
  });
  return ret;
}

/**
 * Given a visible room, generate a report of all the interesting things in it.
 * Meant to be used as the basis for a scouting report.
 * @param rRoom The room being scouted, must be visible.
 * @returns A serializable report of the interesting things in the room.
 */
export function MakeRoomReport(rRoom: Room): RoomReport {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const minerals = rRoom.find(FIND_MINERALS).map(({ room, pos, prototype, effects, ...rest }) => rest as MineralInfo);
  if (minerals.length > 1) Logger.crit(`Room ${rRoom.name} has more than 1 mineral to harvest!`, { '<room>': rRoom });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const deposits = rRoom.find(FIND_DEPOSITS).map(({ room, pos, prototype, effects, ...rest }) => rest as DepositInfo);
  if (deposits.length > 1) Logger.crit(`Room ${rRoom.name} has more than 1 commodity deposit!`, { '<room>': rRoom });

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
    mineral: minerals.pop(),
    deposit: deposits.pop(),
    hostiles: GetHostileInfo(rRoom),
  };
}
