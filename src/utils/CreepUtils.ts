import { countBy, Dictionary } from 'lodash';
import type { CreepExtra } from 'Creep';
import { DeserializeRoomPosition, RoomPositionString } from './Collections';

/** Closest target by path, ignoring creeps as obstacles so the search doesn't stall on traffic. */
export function ClosestByPath<T extends _HasRoomPosition>(creep: CreepExtra, targets: T[]): T | null {
  return creep.pos.findClosestByPath(targets, {
    costCallback: (roomName: string, matrix: CostMatrix) => creep.CostCallback(roomName, matrix, false),
  });
}

export function BodyCost(body: (BodyPartConstant | BodyPartDefinition)[]): number {
  let cost = 0;
  for (const p of body) cost += BODYPART_COST[p instanceof Object ? p.type : p];
  return cost;
}

export function PartCounts(body: BodyPartDefinition[]): Dictionary<number> {
  return countBy(body, part => part.type);
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

export function TryCollectFromAdjacent<T extends AnyStoreStructure | Resource | Ruin | Tombstone | Creep>(
  creep: Creep,
  sources: T[],
  resources: ResourceConstant[] = RESOURCES_ALL,
  amount?: number,
): ScreepsReturnCode {
  for (const source of sources) {
    if (!creep.pos.isNearTo(source)) continue;
    for (const rt of resources) {
      if (source instanceof Resource)
        if (rt === source.resourceType && source.amount > 0 && creep.pickup(source) === OK) return OK;
        else continue;
      else if ((source.store.getUsedCapacity(rt) ?? 0) > 0)
        if (source instanceof Structure && creep.withdraw(source, rt, amount) === OK) return OK;
        else if (source instanceof Creep) if (source.transfer(creep, rt, amount) === OK) return OK;
    }
  }
  return ERR_NOT_FOUND;
}

export function TryTransferToAdjacent<T extends AnyStoreStructure | Creep>(
  creep: Creep,
  targets: T[],
  resources: ResourceConstant[] = RESOURCES_ALL,
  amount?: number,
): ScreepsReturnCode {
  for (const resource of resources) {
    if (creep.store.getUsedCapacity(resource) <= 0) continue;
    for (const target of targets)
      if (!creep.pos.isNearTo(target)) continue;
      else if ((target.store.getFreeCapacity(resource) ?? 0) > 0 && creep.transfer(target, resource, amount) === OK)
        return OK;
  }
  return ERR_NOT_FOUND;
}
