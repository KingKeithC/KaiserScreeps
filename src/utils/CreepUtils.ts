import { Dictionary, sum } from 'lodash';
import { DeserializeRoomPosition, RoomPositionString } from './Collections';

export function BodyCost(body: (BodyPartConstant | BodyPartDefinition)[]): number {
  return sum(body.map(p => BODYPART_COST[p instanceof Object ? p.type : p]));
}

export function PartCounts(body: BodyPartDefinition[]): Dictionary<number> {
  return body.reduce((counts, part) => {
    counts[part.type] = (counts[part.type] ?? 0) + 1;
    return counts;
  }, {} as Dictionary<number>);
}

export function EdgeStoodOn(pos: RoomPosition | RoomPositionString): ExitConstant | null {
  if (typeof pos === 'string') pos = DeserializeRoomPosition(pos);
  if (pos.y === 0) return FIND_EXIT_TOP;
  else if (pos.x === 49) return FIND_EXIT_RIGHT;
  else if (pos.y === 49) return FIND_EXIT_BOTTOM;
  else if (pos.x === 0) return FIND_EXIT_LEFT;
  else return null;
}

export function FromEdgeIntoRoom(exit: ExitConstant | null): DirectionConstant | null {
  if (!exit) return null;
  if (exit === FIND_EXIT_TOP) return BOTTOM;
  else if (exit === FIND_EXIT_RIGHT) return LEFT;
  else if (exit === FIND_EXIT_BOTTOM) return TOP;
  else if (exit === FIND_EXIT_LEFT) return RIGHT;
  else return null;
}
