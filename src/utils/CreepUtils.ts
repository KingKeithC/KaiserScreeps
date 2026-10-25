import { Dictionary, sum } from 'lodash';

export function BodyCost(body: (BodyPartConstant | BodyPartDefinition)[]): number {
  return sum(body.map(p => BODYPART_COST[p instanceof Object ? p.type : p]));
}

export function PartCounts(body: BodyPartDefinition[]): Dictionary<number> {
  return body.reduce((counts, part) => {
    counts[part.type] = (counts[part.type] ?? 0) + 1;
    return counts;
  }, {} as Dictionary<number>);
}
