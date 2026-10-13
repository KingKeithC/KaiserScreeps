
export function Strongest<E>(container: E[], currGetter: (e: E) => number, totalGetter: (e: E) => number, reverse = false): E | undefined {
  const sorter = (a: E, b: E) => (currGetter(a) / totalGetter(a)) - (currGetter(b) / totalGetter(b));
  const sorted = container.sort(sorter);
  if (reverse)
    return sorted[0];
  else
    return sorted.pop();
}

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
  const x = Number.parseInt(xStr);
  const y = Number.parseInt(yStr);
  return new RoomPosition(x, y, roomName);
}

export function FormatStructureHits(s: AnyStructure, precision: number = 3, includeUnits: boolean = true): string {
  const health = ((s.hits / s.hitsMax) * 100).toPrecision(precision);
  return `Hits: %${health}${includeUnits ? ` (${s.hits}/${s.hitsMax})` : ""}`;
}

// Search the spaces around each source, and return
// the number of free spaces which a Miner creep could fill.
export function GetMinerPositions(room: Room): RoomPosition[] {
  const sources = room.find(FIND_SOURCES);
  const terrain = room.getTerrain();
  let spaces = 0;
  const possibleMiners = [];

  for (const s of sources)
    // Given the source.pos is the centre point
    // get the positions of all the surrounding spaces
    for (let x = s.pos.x - 1; x <= s.pos.x + 1; x++)
      for (let y = s.pos.y - 1; y <= s.pos.y + 1; y++) {
        if (x === s.pos.x && y === s.pos.y) continue; // Skip centre point
        if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
          const pos = room.getPositionAt(x, y);
          if (!pos) continue;
          possibleMiners.push(pos);
        }
        spaces++;
      }
  return possibleMiners;
}
