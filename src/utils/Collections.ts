
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
  withTotal: boolean = false,
  extraTotals: number[] = [],
  precision: number = 2,
  units: string = "",
  unitsPlaceValue: number = 1,
): string {
  if (denominator === 0) return "Cant Div By Zero!!!";

  // Start with the main ratio
  var ret = ((numerator / denominator) * 100).toFixed(precision);

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
