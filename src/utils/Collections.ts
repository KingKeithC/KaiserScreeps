
export function Strongest<E>(container: Array<E>, currGetter: (e: E) => number, totalGetter: (e: E) => number, reverse: boolean = false): E | undefined {
  const sorter = (a: E, b: E) => (currGetter(a) / totalGetter(a)) - (currGetter(b) / totalGetter(b));
  const sorted = container.sort(sorter);
  if (reverse)
    return sorted[0];
  else
    return sorted.pop();
}
