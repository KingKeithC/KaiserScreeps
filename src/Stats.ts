import { Colony } from 'Colony';
import { countBy, sum } from 'lodash';
import { Filters, MapNamed } from 'utils/Collections';

interface SchemaField {
  unit: 'ticks' | 'number' | 'cpu' | 'bytes';
  description: string;
  labelKeys?: readonly string[];
}

type Schema<T extends object> = { [k in keyof T]: SchemaField };

interface StatsFrame<S extends object> {
  schema: Schema<S>;
  data: S;
}

type NumericRecord<TKey extends string = string> = Record<TKey, number>;
type LabeledNumericRecord = Record<string, NumericRecord>;

/* eslint-disable camelcase */
// Every top-level key is one metric. Label values are nested map keys in schema.labelKeys order;
// the numeric leaves are the samples. Metrics without labels are plain numbers.
interface ColonyStatsData {
  // Global Stats
  game_time_ticks: number;
  program_reset_time_ticks: number;

  // Performance
  cpu_bucket: number;
  cpu_used: number;
  cpu_limit: number;
  cpu_tick_limit: number;
  heap_stat_bytes: NumericRecord;

  // Account
  resource_amount: NumericRecord;
  visible_rooms_count: number;

  // Global Control Level
  gcl_level: number;
  gcl_progress: number;
  gcl_progress_total: number;

  // Global Power Level
  gpl_level: number;
  gpl_progress: number;
  gpl_progress_total: number;

  // Room
  hostile_creep_count: NumericRecord;
  dropped_energy_amount: NumericRecord;
  storage_capacity: NumericRecord;
  storage_energy: NumericRecord;
  spawn_energy: NumericRecord;
  source_energy: NumericRecord;
  spawn_energy_capacity: NumericRecord;
  container_energy: NumericRecord;
  creep_energy: NumericRecord;
  link_energy: NumericRecord;
  spawns_in_progress: NumericRecord;
  rcl_level: NumericRecord;
  rcl_progress: NumericRecord;
  rcl_progress_total: NumericRecord;

  // Room-Structure
  room_neutral_structure_count: LabeledNumericRecord;
  room_my_structure_count: LabeledNumericRecord;
  room_my_construction_site_count: LabeledNumericRecord;
  room_hostile_structure_count: LabeledNumericRecord;

  // Room-Event
  room_event_count_total: LabeledNumericRecord;
  room_event_amount_total: LabeledNumericRecord;

  // Role-Room
  role_room_quota: LabeledNumericRecord;
  role_room_assigned_creep_count: LabeledNumericRecord;
  role_room_lifetime_idle_ticks: LabeledNumericRecord;
  role_room_lifetime_stuck_ticks: LabeledNumericRecord;
  role_room_my_creep_count: LabeledNumericRecord;
}

const ColonyStatsSchema: Schema<ColonyStatsData> = {
  game_time_ticks: {
    unit: 'ticks',
    description: "Monotonically increasing tick counter, the current 'time' of the game.",
  },
  program_reset_time_ticks: {
    unit: 'ticks',
    description: 'Last time the Program was Reset (happens on code push, or semi-rarely by the platform)',
  },
  visible_rooms_count: { unit: 'number', description: 'The total number of visible rooms this tick.' },
  gcl_level: { unit: 'number', description: 'The current Global Control Level. Increased by upgrading controllers.' },
  gcl_progress: { unit: 'number', description: 'Progress toward the next Global Control Level.' },
  gcl_progress_total: {
    unit: 'number',
    description: 'The Global Control Level will increase when progress reaches this amount.',
  },
  gpl_level: {
    unit: 'number',
    description: 'The current Global Power Level. Increased by harvesting Power from Highway rooms.',
  },
  gpl_progress: { unit: 'number', description: 'Progress toward the next Global Power Level.' },
  gpl_progress_total: {
    unit: 'number',
    description: 'The Global Power Level will increase when progress reaches this amount.',
  },
  cpu_bucket: { unit: 'cpu', description: 'How much CPU has accumulated in the bucket (limit 10k).' },
  cpu_used: { unit: 'cpu', description: 'How much CPU was used this tick in the execution of scripts.' },
  cpu_limit: {
    unit: 'cpu',
    description:
      'The maximum average limit of CPU usage. Excess unused amount below the limit contributes to the CPU bucket.',
  },
  cpu_tick_limit: {
    unit: 'cpu',
    description: 'How much CPU total are we allowed to burst to (and consume from the bucket) this tick?',
  },
  resource_amount: {
    labelKeys: ['resource_type'],
    unit: 'number',
    description: 'Account-level amount of each resource type.',
  },
  heap_stat_bytes: {
    labelKeys: ['stat'],
    unit: 'bytes',
    description: 'Heap statistic values in bytes, labeled by statistic name.',
  },
  role_room_quota: {
    labelKeys: ['role', 'room'],
    unit: 'number',
    description: 'The maximum limit of creeps that may be spawned in this role or room.',
  },
  role_room_assigned_creep_count: {
    labelKeys: ['role', 'room'],
    unit: 'number',
    description: 'The living number of creeps currently spawned by assigned room.',
  },
  role_room_lifetime_idle_ticks: {
    labelKeys: ['role', 'room'],
    unit: 'ticks',
    description: 'The total number of ticks creeps spent idle over their lifetimes.',
  },
  role_room_lifetime_stuck_ticks: {
    labelKeys: ['role', 'room'],
    unit: 'ticks',
    description: 'The total number of ticks creeps intended to move but failed over their lifetimes.',
  },
  role_room_my_creep_count: {
    labelKeys: ['role', 'room'],
    unit: 'number',
    description: 'The living number of creeps currently spawned by occupied room.',
  },
  room_neutral_structure_count: {
    labelKeys: ['room', 'structure_type'],
    unit: 'number',
    description: 'Structures that have no owner, grouped by structure type.',
  },
  hostile_creep_count: { labelKeys: ['room'], unit: 'number', description: 'Living hostile creep count.' },
  room_my_structure_count: {
    labelKeys: ['room', 'structure_type'],
    unit: 'number',
    description: 'Structures I own, grouped by structure type.',
  },
  room_hostile_structure_count: {
    labelKeys: ['room', 'structure_type'],
    unit: 'number',
    description: 'Non-neutral structures owned by someone else, grouped by structure type.',
  },
  dropped_energy_amount: {
    labelKeys: ['room'],
    unit: 'number',
    description: 'Total amount of energy sitting on the ground.',
  },
  room_my_construction_site_count: {
    labelKeys: ['room', 'structure_type'],
    unit: 'number',
    description: 'Ongoing construction sites, grouped by structure type.',
  },
  storage_capacity: {
    labelKeys: ['room'],
    unit: 'number',
    description: 'How much space is available in room storage.',
  },
  storage_energy: { labelKeys: ['room'], unit: 'number', description: 'Energy stored in room storage.' },
  spawn_energy: { labelKeys: ['room'], unit: 'number', description: 'Total energy of all spawns and extensions.' },
  source_energy: {
    labelKeys: ['room'],
    unit: 'number',
    description: 'Total amount of all energy sources in the room.',
  },
  spawn_energy_capacity: {
    labelKeys: ['room'],
    unit: 'number',
    description: 'Total energy capacity of all spawns and extensions.',
  },
  container_energy: { labelKeys: ['room'], unit: 'number', description: 'Total energy stored in room containers.' },
  creep_energy: {
    labelKeys: ['room'],
    unit: 'number',
    description: 'Total energy carried by owned creeps in the room.',
  },
  link_energy: { labelKeys: ['room'], unit: 'number', description: 'Total energy stored in room links.' },
  spawns_in_progress: {
    labelKeys: ['room'],
    unit: 'number',
    description: 'Number of owned spawns currently spawning in the room.',
  },
  rcl_level: { labelKeys: ['room'], unit: 'number', description: 'The current Room Control Level.' },
  rcl_progress: { labelKeys: ['room'], unit: 'number', description: 'Progress toward the next Room Control Level.' },
  rcl_progress_total: {
    labelKeys: ['room'],
    unit: 'number',
    description: 'The Room Control Level will increase when progress reaches this amount.',
  },
  room_event_count_total: {
    labelKeys: ['room', 'event_type'],
    unit: 'number',
    description: 'Total number of times each event occurred in the room.',
  },
  room_event_amount_total: {
    labelKeys: ['room', 'event_type'],
    unit: 'number',
    description: 'Total amount associated with each event type in the room.',
  },
} as const;

export type ColonyStats = StatsFrame<ColonyStatsData>;
export function GetColonyStats(colony: Colony): ColonyStats {
  const previousStatsData = Memory.stats?.data as
    { program_reset_time_ticks?: number; last_reset_time?: number } | undefined;

  const resources: NumericRecord = {};
  for (const r of Object.entries(Game.resources)) resources[r[0]] = r[1] as number;
  resources.credits = Game.market.credits;

  const meminfo: NumericRecord = {};
  if (Game.cpu.getHeapStatistics) {
    for (const [k, v] of Object.entries(Game.cpu.getHeapStatistics())) meminfo[k] = v as number;

    // Not sure what this even means, / I don't care
    // and it breaks the rest of the schema for this field
    if ('does_zap_garbage' in meminfo) delete meminfo.does_zap_garbage;
  }

  return {
    schema: ColonyStatsSchema,
    data: {
      game_time_ticks: Game.time,
      program_reset_time_ticks:
        previousStatsData?.program_reset_time_ticks ?? previousStatsData?.last_reset_time ?? Game.time,
      visible_rooms_count: Object.keys(Game.rooms).length,
      gcl_level: Game.gcl.level,
      gcl_progress: Game.gcl.progress,
      gcl_progress_total: Game.gcl.progressTotal,
      gpl_level: Game.gpl.level,
      gpl_progress: Game.gpl.progress,
      gpl_progress_total: Game.gpl.progressTotal,
      cpu_bucket: Game.cpu.bucket,
      cpu_used: Game.cpu.getUsed(),
      cpu_limit: Game.cpu.limit,
      cpu_tick_limit: Game.cpu.tickLimit,
      resource_amount: resources,
      heap_stat_bytes: meminfo,
      role_room_quota: MapNamed(Object.values(colony.Roles), r => MapNamed(colony.MyRooms, ro => r.GetRoomQuota(ro))),
      role_room_assigned_creep_count: MapNamed(Object.values(colony.Roles), r =>
        MapNamed(colony.MyRooms, ro => r.GetRoomCreepsInRole(ro).length),
      ),
      role_room_lifetime_idle_ticks: MapNamed(Object.values(colony.Roles), r =>
        MapNamed(colony.MyRooms, ro => sum(r.GetRoomCreepsInRole(ro), cir => cir.LifetimeIdle)),
      ),
      role_room_lifetime_stuck_ticks: MapNamed(Object.values(colony.Roles), r =>
        MapNamed(colony.MyRooms, ro => sum(r.GetRoomCreepsInRole(ro), cir => cir.LifetimeStuck)),
      ),
      role_room_my_creep_count: MapNamed(Object.values(colony.Roles), r =>
        MapNamed(
          colony.MyRooms,
          ro => ro.find(FIND_MY_CREEPS, { filter: Filters.CreepMemoryRoleName(r.roleName) }).length,
        ),
      ),
      room_neutral_structure_count: MapNamed(Object.values(Game.rooms), vr =>
        countBy(vr.find(FIND_STRUCTURES, { filter: s => !('owner' in s) }), s => s.structureType),
      ),
      hostile_creep_count: MapNamed(Object.values(Game.rooms), vr => vr.find(FIND_HOSTILE_CREEPS).length),
      room_my_structure_count: MapNamed(Object.values(Game.rooms), vr =>
        countBy(vr.find(FIND_MY_STRUCTURES), s => s.structureType),
      ),
      room_hostile_structure_count: MapNamed(Object.values(Game.rooms), vr =>
        countBy(vr.find(FIND_HOSTILE_STRUCTURES), s => s.structureType),
      ),
      dropped_energy_amount: MapNamed(Object.values(Game.rooms), vr =>
        sum(vr.find(FIND_DROPPED_RESOURCES), r => (r.resourceType === RESOURCE_ENERGY ? r.amount : 0)),
      ),
      room_my_construction_site_count: MapNamed(Object.values(Game.rooms), vr =>
        countBy(vr.find(FIND_MY_CONSTRUCTION_SITES), s => s.structureType),
      ),
      storage_capacity: MapNamed(Object.values(Game.rooms), vr => vr.storage?.store.getCapacity() ?? 0),
      storage_energy: MapNamed(
        Object.values(Game.rooms),
        vr => vr.storage?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0,
      ),
      spawn_energy: MapNamed(Object.values(Game.rooms), vr => vr.energyAvailable),
      source_energy: MapNamed(Object.values(Game.rooms), vr => sum(vr.find(FIND_SOURCES).map(s => s.energy))),
      spawn_energy_capacity: MapNamed(Object.values(Game.rooms), vr => vr.energyCapacityAvailable),
      container_energy: MapNamed(Object.values(Game.rooms), vr =>
        sum(
          vr
            .find(FIND_STRUCTURES)
            .map(s => (Filters.StructureContainer(s) ? s.store.getUsedCapacity(RESOURCE_ENERGY) : 0)),
        ),
      ),
      creep_energy: MapNamed(Object.values(Game.rooms), vr =>
        sum(vr.find(FIND_MY_CREEPS).map(s => s.store.getUsedCapacity(RESOURCE_ENERGY))),
      ),
      link_energy: MapNamed(Object.values(Game.rooms), vr =>
        sum(
          vr
            .find(FIND_STRUCTURES)
            .map(s => (s.structureType === STRUCTURE_LINK ? s.store.getUsedCapacity(RESOURCE_ENERGY) : 0)),
        ),
      ),
      spawns_in_progress: MapNamed(
        Object.values(Game.rooms),
        vr => vr.find(FIND_MY_SPAWNS).filter(s => s.spawning !== null && s.spawning !== undefined).length,
      ),
      rcl_progress_total: MapNamed(colony.MyRooms, mr => mr.controller?.progressTotal ?? 0),
      rcl_progress: MapNamed(colony.MyRooms, mr => mr.controller?.progress ?? 0),
      rcl_level: MapNamed(colony.MyRooms, mr => mr.controller?.level ?? 0),
      room_event_count_total: MapNamed(colony.MyRooms, mr => mr.EventCounts),
      room_event_amount_total: MapNamed(colony.MyRooms, mr => mr.EventAmounts),
    },
  };
}
/* eslint-enable camelcase */
