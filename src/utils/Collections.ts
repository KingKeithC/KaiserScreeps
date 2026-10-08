
export function Strongest<E>(container: Array<E>, currGetter: (e: E) => number, totalGetter: (e: E) => number, reverse: boolean = false): E | undefined {
  const sorter = (a: E, b: E) => (currGetter(a) / totalGetter(a)) - (currGetter(b) / totalGetter(b));
  const sorted = container.sort(sorter);
  if (reverse)
    return sorted[0];
  else
    return sorted.pop();
}

export function LerpColour(from: string, to: string, ratio: number): string {
  const fromColour = [
    Number.parseInt(from.slice(1, 3), 16),
    Number.parseInt(from.slice(3, 5), 16),
    Number.parseInt(from.slice(5, 7), 16),
  ];
  const toColour = [
    Number.parseInt(to.slice(1, 3), 16),
    Number.parseInt(to.slice(3, 5), 16),
    Number.parseInt(to.slice(5, 7), 16),
  ];
  const newColour = toColour.map((channel, index) => Math.round(channel + (fromColour[index] - channel) * (1 - ratio)));
  return "#" + newColour.map(value => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("");
}
