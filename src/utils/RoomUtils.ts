import { groupBy } from "lodash";
import { RoomPositionString, SerializeRoomPosition } from "./Collections";
import { BodyCost as CrrepBodyCost, PartCounts as CreepBodypartCounts } from "./CreepUtils";

/*

  Standalone Functions/Types related to rooms.

*/

/* ------------- Interfaces ------------- */

export interface HostileInfo {
  type: "creep" | BuildableStructureConstant;
  id: Id<_HasId & _HasRoomPosition>;
  ownerUsername: string;
  pos: RoomPositionString;
  bodyCost?: number;
  partCounts?: { [part: string]: number; };
}

export interface MiningPosition {
  position: RoomPosition,
  sourceId: Id<Source>,
};

/* ------------- Functions ------------- */

export function GetHostileInfo(room: Room): HostileInfo[] {
  const hostileCreeps = room.find(FIND_HOSTILE_CREEPS).map(c => ({
    type: "creep" as const,
    id: c.id,
    ownerUsername: c.owner.username,
    pos: SerializeRoomPosition(c.pos),
    bodyCost: CrrepBodyCost(c.body.map(p => p.type)),
    partCounts: CreepBodypartCounts(c.body),
  }));

  const hostileStructures: HostileInfo[] = room.find(FIND_HOSTILE_STRUCTURES).map(s => ({
    type: s.structureType as BuildableStructureConstant,
    id: s.id,
    ownerUsername: s.owner!.username,
    pos: SerializeRoomPosition(s.pos),
  }));

  return [...hostileCreeps, ...hostileStructures];
}

export function FormatHostileInfos(infos: HostileInfo[]): string {
  var report = "";
  const hostilesByOwner = groupBy(infos, h => h.ownerUsername);
  for (const owner in hostilesByOwner) {
    const structures = hostilesByOwner[owner].filter(h => h.type !== "creep");
    const structureDetail = Object.entries(groupBy(structures, h => h.type)).reduceRight((acc, e) => `${e[0]}: ${e[1].length}, ${acc}`, "");
    report += `[${owner}: ${hostilesByOwner[owner].filter(h => h.type === "creep").length} Creeps, ${structures.length} Structures: {${structureDetail}}]`;
  }
  return report;
}

// Search the spaces around each source, and return
// the number of free spaces which a Miner creep could fill.
export function GetMinerPositions(room: Room): MiningPosition[] {
  const sources = room.find(FIND_SOURCES);
  const terrain = room.getTerrain();
  let spaces = 0;
  const positions: MiningPosition[] = [];

  for (const s of sources)
    // Given the source.pos is the centre point
    // get the positions of all the surrounding spaces
    for (let x = s.pos.x - 1; x <= s.pos.x + 1; x++)
      for (let y = s.pos.y - 1; y <= s.pos.y + 1; y++) {
        if (x === s.pos.x && y === s.pos.y) continue; // Skip centre point
        if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
          const pos = room.getPositionAt(x, y);
          if (!pos) continue;
          positions.push({ position: pos, sourceId: s.id });
        }
        spaces++;
      }
  return positions;
}
