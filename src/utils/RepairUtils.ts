import { Filters } from './Collections';

export interface RepairPrioritySelection {
  repairs: AnyStructure[];
  maxWorkers: number;
}

export interface RepairPriorityGroup {
  allowedStructures: StructureConstant[];
  callback: (room: Room, candidates: AnyStructure[]) => RepairPrioritySelection;
}

export interface PendingRepairs {
  candidates: AnyStructure[];
  priorities: RepairPriorityGroup[];
}

const allStructureTypes: StructureConstant[] = [
  STRUCTURE_EXTENSION,
  STRUCTURE_RAMPART,
  STRUCTURE_ROAD,
  STRUCTURE_SPAWN,
  STRUCTURE_LINK,
  STRUCTURE_WALL,
  STRUCTURE_KEEPER_LAIR,
  STRUCTURE_CONTROLLER,
  STRUCTURE_STORAGE,
  STRUCTURE_TOWER,
  STRUCTURE_OBSERVER,
  STRUCTURE_POWER_BANK,
  STRUCTURE_POWER_SPAWN,
  STRUCTURE_EXTRACTOR,
  STRUCTURE_LAB,
  STRUCTURE_TERMINAL,
  STRUCTURE_CONTAINER,
  STRUCTURE_NUKER,
  STRUCTURE_FACTORY,
  STRUCTURE_INVADER_CORE,
  STRUCTURE_PORTAL,
];
const generalRepairStructureTypes = allStructureTypes.filter(
  structureType =>
    structureType !== STRUCTURE_RAMPART && structureType !== STRUCTURE_WALL && structureType !== STRUCTURE_ROAD,
);

const repairPriorities: RepairPriorityGroup[] = [
  {
    allowedStructures: generalRepairStructureTypes,
    callback: (_room, candidates) => ({
      repairs: candidates.filter(structure => structure.hits / structure.hitsMax < 0.8),
      maxWorkers: 2,
    }),
  },
  {
    allowedStructures: [STRUCTURE_ROAD],
    callback: (_room, candidates) => ({
      repairs: candidates.filter(structure => structure.hits / structure.hitsMax < 0.75),
      maxWorkers: 1,
    }),
  },
  {
    allowedStructures: [STRUCTURE_RAMPART, STRUCTURE_WALL],
    callback: (_room, candidates) => ({
      repairs: candidates.filter(structure => structure.hits < 100_000 && Filters.Damaged(structure)),
      maxWorkers: 1,
    }),
  },
  {
    allowedStructures: [STRUCTURE_RAMPART],
    callback: (_room, candidates) => ({
      repairs: candidates.filter(
        structure =>
          structure.hits < 1_000_000 &&
          Filters.Damaged(structure) &&
          structure.pos
            .lookFor(LOOK_STRUCTURES)
            .some(
              adjacent => adjacent.structureType !== STRUCTURE_ROAD && adjacent.structureType !== STRUCTURE_RAMPART,
            ),
      ),
      maxWorkers: 1,
    }),
  },
  {
    allowedStructures: allStructureTypes,
    callback: (room, candidates) => ({
      repairs:
        room.memory.foreverRepair === true
          ? candidates.filter(structure => structure.hits / structure.hitsMax < 0.5)
          : [],
      maxWorkers: 1,
    }),
  },
];

export function CreatePendingRepairs(room: Room): PendingRepairs {
  return { candidates: room.find(FIND_STRUCTURES, { filter: Filters.Damaged }), priorities: repairPriorities };
}

export function FindHighestPriorityRepairGroup(
  room: Room,
  pendingRepairs: PendingRepairs,
): RepairPrioritySelection | null {
  for (const priority of pendingRepairs.priorities) {
    const candidates = pendingRepairs.candidates.filter(structure =>
      priority.allowedStructures.includes(structure.structureType),
    );
    const selection = priority.callback(room, candidates);
    if (selection.repairs.length > 0) return selection;
  }
  return null;
}
