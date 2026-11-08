import { groupBy } from 'lodash';
import { Filters, RoomPositionString, SerializeRoomPosition, SerializeRoomPositionTriple } from './Collections';
import { BodyCost, PartCounts } from './CreepUtils';
import { Logger } from './Logger';

/*

  Standalone Functions/Types related to rooms.

*/

export type ResourceContainer =
  Creep | StructureLink | StructureStorage | StructureContainer | Resource | Ruin | Tombstone | Mineral;

export type ContainerAndAmount = [ResourceContainer, number];

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

export interface CollectionPlan {
  sourcesByType: Map<ResourceConstant, ContainerAndAmount[]>;
  reservedCapacityBySource: Map<string, number>;
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
export function CouldCreepStandAt(x: number, y: number, room: Room, terrain: RoomTerrain = room.getTerrain()): boolean {
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

  Logger.info('Found mineable positions.', { '<room>': room, found, searched, sources });
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

export function ResourceContainersForRoomByType(room: string | Room): Map<ResourceConstant, ContainerAndAmount[]> {
  const ret = new Map<ResourceConstant, ContainerAndAmount[]>();
  if (typeof room === 'string') return ret;

  for (const dropped of room.find(FIND_DROPPED_RESOURCES, { filter: r => r.amount > 0 }))
    ret.set(dropped.resourceType, [...(ret.get(dropped.resourceType) ?? []), [dropped, dropped.amount]]);

  for (const tomb of room.find(FIND_TOMBSTONES, { filter: r => r.store.getUsedCapacity() > 0 }))
    for (const rt in tomb.store)
      ret.set(rt as ResourceConstant, [
        ...(ret.get(rt as ResourceConstant) ?? []),
        [tomb, tomb.store.getUsedCapacity(rt as ResourceConstant)],
      ]);

  for (const ruin of room.find(FIND_RUINS, { filter: r => r.store.getUsedCapacity() > 0 }))
    for (const rt in ruin.store)
      ret.set(rt as ResourceConstant, [
        ...(ret.get(rt as ResourceConstant) ?? []),
        [ruin, ruin.store.getUsedCapacity(rt as ResourceConstant)],
      ]);

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  for (const container of room.find(FIND_STRUCTURES, {
    filter: s => Filters.StructureContainer(s) && s.store.getUsedCapacity() > 0,
  }) as StructureContainer[])
    for (const rt in container.store)
      ret.set(rt as ResourceConstant, [
        ...(ret.get(rt as ResourceConstant) ?? []),
        [container, container.store.getUsedCapacity(rt as ResourceConstant)],
      ]);

  if (CONTROLLER_STRUCTURES.link[room.controller?.level ?? 0] > 0)
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    for (const recv of room.find(FIND_MY_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_LINK && s.id in (room.memory.linkGroups ?? {}).Receivers,
    }) as StructureLink[])
      for (const rt in recv.store)
        ret.set(rt as ResourceConstant, [
          ...(ret.get(rt as ResourceConstant) ?? []),
          [recv, recv.store.getUsedCapacity(rt as ResourceConstant) ?? 0],
        ]);

  return ret;
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
    if (!existingReport) return [];
    if (!existingReport.mines) return [];

    // Don't return mines for hostile rooms, since we can
    // only mine neutral or owned rooms.
    if (existingReport.owner !== undefined && existingReport.owner !== myUsername) return [];

    return existingReport.mines;
  }

  // Not an owned room
  // Get mines from the room's scouting report, and if there is
  // no scouting report, create a new one and return the mines from that.
  if (room instanceof Room) {
    existingReport = Memory.scoutingReports[room.name];

    if (existingReport !== undefined)
      if (existingReport.mines !== undefined && existingReport.mines.length > 0) return existingReport.mines;
      else {
        if (
          room.controller !== undefined &&
          room.controller.owner !== undefined &&
          room.controller.owner.username === myUsername
        ) {
          Logger.warn('Skipping unminable hostile room.', { '<rate>': 20, '<room>': room, roomName: room.name });
          return [];
        }

        const mines = GetMiningPositions(room);
        Memory.scoutingReports[room.name].mines = mines;
        return mines;
      }
    else {
      // Broken - Causes Type Error, tried to lookup a non-visible room
      // const report = MakeRoomReport(cr);
      // Memory.scoutingReports[cr.name] = report;
      // return report.mines;
    }
  }

  return [];
}
