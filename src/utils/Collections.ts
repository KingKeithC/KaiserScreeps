
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
