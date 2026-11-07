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

export function TryCollectFromContainer(
  creep: Creep,
  containers: StructureContainer[],
  collectionLimit?: number,
  resources: ResourceConstant[] = RESOURCES_ALL,
): boolean {
  if (creep.store.getFreeCapacity() === 0) return false;
  for (const rt of resources) {
    if (collectionLimit && collectionLimit <= 0) continue;
    for (const container of containers)
      if ((container.store.getUsedCapacity(rt) ?? 0) > 0 && creep.withdraw(container, rt, collectionLimit) === OK)
        return true;
  }
  return false;
}

export function TryCollectFromTombs(
  creep: Creep,
  resources: ResourceConstant[] = RESOURCES_ALL,
  collectionLimit: number = creep.store.getFreeCapacity(),
): boolean {
  if (creep.store.getFreeCapacity() === 0) return false;
  for (const rt of resources) {
    if (collectionLimit <= 0) continue;
    for (const tomb of creep.pos.findInRange(FIND_TOMBSTONES, 1))
      if ((tomb.store.getUsedCapacity(rt) ?? 0) > 0 && creep.withdraw(tomb, rt, collectionLimit) === OK) return true;
  }
  return false;
}

export function TryPickupDropped(creep: Creep, resources: ResourceConstant[] = RESOURCES_ALL): boolean {
  if (creep.store.getFreeCapacity() === 0) return false;
  for (const rt of resources) {
    for (const d of creep.pos.findInRange(FIND_DROPPED_RESOURCES, 1, { filter: { resourceType: rt } }))
      if (creep.pickup(d) === OK) return true;
  }

  return false;
}

export function TryTransferTo<T extends AnyStoreStructure>(
  creep: Creep,
  targets: T[],
  resources: ResourceConstant[] = RESOURCES_ALL,
  minimumFreeCapacity = 0,
): boolean {
  for (const resource of resources) {
    if (creep.store.getUsedCapacity(resource) <= 0) continue;
    for (const target of targets)
      if (
        (target.store.getFreeCapacity(resource) ?? 0) > minimumFreeCapacity &&
        creep.transfer(target, resource) === OK
      )
        return true;
  }

  return false;
}
