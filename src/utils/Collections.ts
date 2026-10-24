import { flatten } from "lodash";

export function UnpackColour(colour: string): [number, number, number] {
  return [
    Number.parseInt(colour.slice(1, 3), 16),
    Number.parseInt(colour.slice(3, 5), 16),
    Number.parseInt(colour.slice(5, 7), 16),
  ];
}

export function PackColour(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(value => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("");
}

export function LerpColour(from: string, to: string, ratio: number): string {
  const fromColour = UnpackColour(from);
  const toColour = UnpackColour(to);
  const newColour = toColour.map((channel, index) => Math.round(channel + (fromColour[index] - channel) * (1 - ratio)));
  return PackColour(newColour[0], newColour[1], newColour[2]);
}

export function MakeBody(...opts: [BodyPartConstant, number][]): BodyPartConstant[] {
  let result: BodyPartConstant[] = [];
  for (const [part, qty] of opts)
    result = result.concat(Array(qty).fill(part));
  return result;
}

export type RoomPositionString = string;

export function SerializeRoomPosition(pos: RoomPosition): RoomPositionString {
  return `${pos.roomName}:${pos.x}:${pos.y}`;
}

export function DeserializeRoomPosition(str: RoomPositionString): RoomPosition {
  const [roomName, xStr, yStr] = str.split(":");
  const x = Number.parseInt(xStr, 10);
  const y = Number.parseInt(yStr, 10);
  return new RoomPosition(x, y, roomName);
}

export function FormatStructureHits(s: AnyStructure, precision = 3, includeUnits = true): string {
  const health = ((s.hits / s.hitsMax) * 100).toPrecision(precision);
  return `Hits: %${health}${includeUnits ? ` (${s.hits}/${s.hitsMax})` : ""}`;
}

/**
 * Divide a value by another value and pretty print the result.
 *
 * Can optionally include the totals or other related numbers that formed the result.
 *
 * @param numerator The main numerator or 'Current' value for the calculated percent.
 * @param denominator The main denominator or 'Limit' value for the calculated percent.
 * @param withTotal Include the total amounts that went into the 'Current/Total' calculation.
 * @param extraTotals Additional totals to include in the 'withTotal' section after the main values.
 * @param precision Format all floats to this many places before rendering.
 * @param units An optional unit to append in the `withTotal` section.
 * @param unitsPlaceValue How many of the underlying values are represented by 1 `units`.
 * @returns A formatted string for logging.
 */
export function FmtRatios(
  numerator: number,
  denominator: number,
  withTotal = false,
  extraTotals: number[] = [],
  precision = 2,
  units = "",
  unitsPlaceValue = 1,
): string {
  if (denominator === 0) return "Cant Div By Zero!!!";

  // Start with the main ratio
  let ret = ((numerator / denominator) * 100).toFixed(precision);

  // If a total is to be included, wrap it in parens and append to the end after a space
  if (withTotal) {
    const ratios = [
      // Current
      numerator / unitsPlaceValue,

      // Total
      denominator / unitsPlaceValue,

      // Optional Totals for groups above this, should use the same units as the main calculation.
      ...extraTotals.map(t => t / unitsPlaceValue),
    ];

    ret += ' (';
    ret += ratios.map(curr => `${(curr).toFixed(precision)}${units}`).join(" / ");
    ret += ')';
  }

  // Return string prepended with a percent sign
  return "%" + ret;
}

export function MySpawnsOrExtensions(): (StructureSpawn | StructureExtension)[] {
  return Object.values(Game.structures).filter(s => (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) && s.my) as (StructureSpawn | StructureExtension)[];
}

export function MyTowers(): StructureTower[] {
  return Object.values(Game.structures).filter(s => s.structureType === STRUCTURE_TOWER && s.my) as StructureTower[];
}

export function MyConstructionSites(): ConstructionSite[] {
  return Object.values(Game.constructionSites).filter(s => s.my);
}

export function Sources(): Source[] {
  return flatten(Object.values(Game.rooms).map(r => r.find(FIND_SOURCES)));
}

export function Strongest<E>(container: E[], currGetter: (e: E) => number, totalGetter: (e: E) => number, reverse = false): E | undefined {
  const sorted = container.sort((a: E, b: E) => (currGetter(a) / totalGetter(a)) - (currGetter(b) / totalGetter(b)));
  return reverse ? sorted[0] : sorted.pop();
}

export function Weakest<E>(container: E[], currGetter: (e: E) => number, totalGetter: (e: E) => number): E | undefined {
  return Strongest(container, currGetter, totalGetter, true);
}

export function SearchLocalByPathThenRemoteByStrength(
  start: _HasRoomPosition,
  candidates: _HasRoomPosition[],
  strengthSorter: (a: _HasRoomPosition, b: _HasRoomPosition) => number
): _HasRoomPosition | null {
  const inThisRoom = [];
  const notInThisRoom = [];

  // Split the candidates into groups based on whether
  // they are in the same room as the start.
  for (const p of candidates)
    if (p.pos.roomName === start.pos.roomName)
      inThisRoom.push(p);
    else
      notInThisRoom.push(p);

  // Filter the candidate in this room by path
  let found: _HasRoomPosition | undefined | null;

  found = start.pos.findClosestByPath(inThisRoom, { ignoreCreeps: true });
  if (found) return found;

  // Filter the remaining candidates by the strength function
  found = notInThisRoom.sort(strengthSorter).pop();
  if (found) return found;

  return null;
}
