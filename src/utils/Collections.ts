import { ResourceContainer } from './RoomUtils';

export interface NamedEntity {
  readonly name: string;
}

export interface CurrentTaskHolder<Task> {
  readonly currentTask: Task | null;
}

export interface ActionNamedTask {
  readonly action: string;
}

export interface TaskActionSelector<Task extends ActionNamedTask> {
  readonly action: Task['action'];
}

export function MapNamed<N extends NamedEntity, T>(
  iterOfNamed: Iterable<N>,
  mapper: (named: N) => T,
): Record<string, T> {
  const ret: Record<string, T> = {};
  for (const named of iterOfNamed) ret[named.name] = mapper(named);
  return ret;
}

export function* AssignedTasksWithEntity<
  Entity extends CurrentTaskHolder<Task>,
  Task extends ActionNamedTask,
  SelectedTask extends Task = Task,
>(entities: Iterable<Entity>, taskClass?: TaskActionSelector<SelectedTask>): IterableIterator<[Entity, SelectedTask]> {
  for (const entity of entities) {
    const task = entity.currentTask;
    if (task !== null && (taskClass === undefined || task.action === taskClass.action))
      yield [entity, task as SelectedTask];
  }
}

export function* TasksOfEntities<
  Entity extends CurrentTaskHolder<Task>,
  Task extends ActionNamedTask,
  SelectedTask extends Task = Task,
>(entities: Iterable<Entity>, taskClass?: TaskActionSelector<SelectedTask>): IterableIterator<SelectedTask> {
  for (const [, task] of AssignedTasksWithEntity<Entity, Task, SelectedTask>(entities, taskClass)) yield task;
}

export function UnpackColour(colour: string): [number, number, number] {
  return [
    Number.parseInt(colour.slice(1, 3), 16),
    Number.parseInt(colour.slice(3, 5), 16),
    Number.parseInt(colour.slice(5, 7), 16),
  ];
}

export function PackColour(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(value => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0')).join('');
}

export function LerpColour(from: string, to: string, ratio: number): string {
  const fromColour = UnpackColour(from);
  const toColour = UnpackColour(to);
  const newColour = toColour.map((channel, index) => Math.round(channel + (fromColour[index] - channel) * (1 - ratio)));
  return PackColour(newColour[0], newColour[1], newColour[2]);
}

export function MakeBody(...opts: [BodyPartConstant, number][]): BodyPartConstant[] {
  const result: BodyPartConstant[] = [];
  for (const [part, qty] of opts) for (let i = 0; i < qty; i++) result.push(part);
  return result;
}

export type RoomPositionString = string;

export function SerializeRoomPosition(pos: RoomPosition): RoomPositionString {
  return SerializeRoomPositionTriple(pos.x, pos.y, pos.roomName);
}

export function SerializeRoomPositionTriple(x: number, y: number, roomName: string): RoomPositionString {
  return `${roomName}:${x}:${y}`;
}

export function DeserializeRoomPosition(str: RoomPositionString): RoomPosition {
  const [roomName, xStr, yStr] = str.split(':');
  const x = Number.parseInt(xStr, 10);
  const y = Number.parseInt(yStr, 10);
  return new RoomPosition(x, y, roomName);
}

export function FormatStructureHits(s: AnyStructure, precision = 3, includeUnits = true): string {
  const health = ((s.hits / s.hitsMax) * 100).toPrecision(precision);
  return `Hits: %${health}${includeUnits ? ` (${s.hits}/${s.hitsMax})` : ''}`;
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
  units = '',
  unitsPlaceValue = 1,
): string {
  if (denominator === 0) return 'Cant Div By Zero!!!';

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
    ret += ratios.map(curr => `${curr.toFixed(precision)}${units}`).join(' / ');
    ret += ')';
  }

  // Return string prepended with a percent sign
  return '%' + ret;
}

export function ResourceContainerUsedRatio(target: ResourceContainer): string {
  let current = 0;
  let capacity = 1;
  if (target instanceof Resource) {
    current = target.amount;
    capacity = 1; // Unlimited for Resource, so just set to 1 to not cause div by zero.
  } else if ('store' in target) {
    current = target.store.getUsedCapacity() ?? 0;
    capacity = target.store.getCapacity() ?? 1; // Null for Ruins, so default to 1.
  } else throw new Error(`Unhandled ResourceContainer: ${target}`);
  return ((current / capacity) * 100).toFixed(2);
}

export function GetValueByName<T>(dict: { [name: string]: T }, obj: NamedEntity, initialValue: () => T): T {
  return (dict[obj.name] ??= initialValue());
}

interface HitRatioTarget {
  hits: number;
  hitsMax: number;
}

export const Sorts = {
  StructureHitsRatioAsc: (a: HitRatioTarget, b: HitRatioTarget) => a.hits / a.hitsMax - b.hits / b.hitsMax,
  StructureHitsRatioDesc: (a: HitRatioTarget, b: HitRatioTarget) => Sorts.StructureHitsRatioAsc(b, a),
  AttackIndexAsc: (a: Flag, b: Flag) => (a.memory.attackIndex ?? 0) - (b.memory.attackIndex ?? 0),
  NumberPairValueAsc: <T>(a: readonly [T, number], b: readonly [T, number]) => a[1] - b[1],
  ConstructionProgressRatioAsc: (a: ConstructionSite, b: ConstructionSite) =>
    a.progress / a.progressTotal - b.progress / b.progressTotal,
  StoreEnergyRatioAsc: (a: AnyStoreStructure, b: AnyStoreStructure) =>
    a.store.getUsedCapacity(RESOURCE_ENERGY) / a.store.getCapacity(RESOURCE_ENERGY) -
    b.store.getUsedCapacity(RESOURCE_ENERGY) / b.store.getCapacity(RESOURCE_ENERGY),
  RolePriorityAsc: (a: { role: { priority: number } }, b: { role: { priority: number } }) =>
    a.role.priority - b.role.priority,
  EstimatedProfitDesc: (a: { estProfit: number }, b: { estProfit: number }) => b.estProfit - a.estProfit,
} as const;

export const Filters = {
  Damaged: (target: HitRatioTarget) => target.hits < target.hitsMax,
  CreepRoleName: (roleName: string) => (creep: { role: { roleName: string } }) => creep.role.roleName === roleName,
  CreepRoleGroupName: (groupName: string) => (creep: { role: { groupName: string } }) =>
    creep.role.groupName === groupName,
  CreepMemoryRoomName: (roomName: string) => (creep: { memory: { room?: string } }) => creep.memory.room === roomName,
  CreepMemoryRoleName: (roleName: string) => (creep: { memory: { role?: string } }) => creep.memory.role === roleName,
  StructureContainer: (structure: AnyStructure): structure is StructureContainer =>
    structure.structureType === STRUCTURE_CONTAINER,
  StructureTower: (structure: AnyStructure): structure is StructureTower => structure.structureType === STRUCTURE_TOWER,
  StructureRampart: (structure: AnyStructure): structure is StructureRampart =>
    structure.structureType === STRUCTURE_RAMPART,
  StructureRoad: (structure: AnyStructure): structure is StructureRoad => structure.structureType === STRUCTURE_ROAD,
  StructureLab: (structure: AnyStructure): structure is StructureLab => structure.structureType === STRUCTURE_LAB,
  StructureSpawn: (structure: AnyStructure): structure is StructureSpawn => structure.structureType === STRUCTURE_SPAWN,
  StructureWallOrRampart: (structure: AnyStructure) =>
    structure.structureType === STRUCTURE_WALL || structure.structureType === STRUCTURE_RAMPART,
  StructureSpawnOrExtension: (structure: AnyStructure): structure is StructureSpawn | StructureExtension =>
    structure.structureType === STRUCTURE_SPAWN || structure.structureType === STRUCTURE_EXTENSION,
  ConstructionRampartOrWall: (site: ConstructionSite) =>
    site.structureType === STRUCTURE_RAMPART || site.structureType === STRUCTURE_WALL,
  ConstructionType: (structureType: BuildableStructureConstant) => (site: ConstructionSite) =>
    site.structureType === structureType,
  NonWalkableStructure: (structure: { structureType: StructureConstant; my?: boolean }) =>
    structure.structureType !== STRUCTURE_ROAD &&
    structure.structureType !== STRUCTURE_CONTAINER &&
    (structure.structureType !== STRUCTURE_RAMPART || !structure.my),
} as const;

export const OK_MOVE_DONE = 1 as const;
