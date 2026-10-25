import { groupBy } from 'lodash';
import { RoomPositionString, SerializeRoomPosition } from './Collections';
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

// Search the spaces around each source, and return
// the number of free spaces which a Miner creep could fill.
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
        if (x === s.pos.x && y === s.pos.y) continue; // Skip centre point
        if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
          const pos = room.getPositionAt(x, y);
          if (!pos) continue;
          ret.push({ source: s.id, pos: SerializeRoomPosition(pos) });
          found++;
        }
        searched++;
      }

  Logger.info(`GetMinerPositions: ${sources.length} Sources have ${found} positions (${searched} searched).`, {
    '<room>': room,
  });
  return ret;
}

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
