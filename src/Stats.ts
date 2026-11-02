import { Colony } from 'Colony';
import { sum } from 'lodash';

interface SchemaField {
  unit: 'ticks' | 'number' | 'cpu' | 'bytes';
  description: string;
  labelKeys?: readonly string[];
}

type Schema<T extends object> = { [k in keyof T]: SchemaField | (T[k] extends object ? Schema<T[k]> : never) };

interface StatsFrame<S extends object> {
  schema: Schema<S>;
  data: S;
}

type NumericRecord<TKey extends string = string> = Record<TKey, number>;
type RoleRoomNumericRecord = Record<string, NumericRecord>;
type RoomEventNumericRecord = Record<string, NumericRecord>;

/* eslint-disable camelcase */
interface ColonyStatsData {
  time: number;
  last_reset_time: number;
  visible_rooms_count: number;

  // [string] Labels
  gcl: NumericRecord;
  gpl: NumericRecord;
  cpu: NumericRecord;
  meminfo: NumericRecord;
  rcl_level: NumericRecord;
  rcl_progress: NumericRecord;
  rcl_progressTotal: NumericRecord;
  resources: NumericRecord;
  spawns_in_progress: NumericRecord;
  neutral_structure_count: RoomEventNumericRecord;
  hostile_creep_count: NumericRecord;
  my_structure_count: RoomEventNumericRecord;
  my_constructions_count: RoomEventNumericRecord;
  hostile_structure_count: RoomEventNumericRecord;
  dropped_energy_amount: NumericRecord;
  capacity_of_storage: NumericRecord;
  energy_in_storage: NumericRecord;
  energy_in_spawns: NumericRecord;
  energy_in_sources: NumericRecord;
  capacity_of_spawns: NumericRecord;
  energy_in_containers: NumericRecord;
  energy_in_my_creeps: NumericRecord;
  energy_in_links: NumericRecord;

  // ['room', 'eventType'] Labels
  event_counts_total: RoomEventNumericRecord;
  event_amounts_total: RoomEventNumericRecord;

  // ['role', 'room'] Labels
  room_quota: RoleRoomNumericRecord;
  assigned_room_count: RoleRoomNumericRecord;
  lifetime_idle_ticks: RoleRoomNumericRecord;
  lifetime_stuck_ticks: RoleRoomNumericRecord;
  my_creep_count: RoleRoomNumericRecord;
}

const ColonyStatsSchema: Schema<ColonyStatsData> = {
  time: { unit: 'ticks', description: "Monotonicly increasing tick counter, the current 'time' of the Game." },
  last_reset_time: {
    unit: 'ticks',
    description: 'Last time the Program was Reset (happens on code push, or semi-rarely by the platform)',
  },
  visible_rooms_count: { unit: 'number', description: 'The total number of visible rooms this tick.' },
  gcl: {
    level: { unit: 'number', description: 'The current Global Control Level. Increased by upgrading controllers.' },
    progress: { unit: 'number', description: 'Progress toward the next Global Control Level.' },
    progressTotal: {
      unit: 'number',
      description: 'The Global Control Level will increase when Progress reaches this amount.',
    },
  },
  gpl: {
    level: {
      unit: 'number',
      description: 'The current Global Power Level. Increased by harvesting Power from Highway rooms.',
    },
    progress: { unit: 'number', description: 'Progress toward the next Global Power Level.' },
    progressTotal: {
      unit: 'number',
      description: 'The Global Power Level will increase when Progress reaches this amount.',
    },
  },
  cpu: {
    unusedBucket: { unit: 'cpu', description: 'How much CPU has accumulated in the bucket (limit 10k).' },
    used: { unit: 'cpu', description: 'How much CPU was used this tick in the execution of scripts.' },
    limit: {
      unit: 'cpu',
      description:
        'The maximum average limit of CPU usage. Excess unused amount below the limit contributes to the unusedBucket.',
    },
    tickLimit: {
      unit: 'cpu',
      description: 'How much CPU total are we allowed to burst to (and consume from the bucket) this tick?',
    },
  },
  resources: { labelKeys: ['resourceType'], unit: 'number', description: 'Account level resources.' },
  meminfo: { unit: 'bytes', description: 'How much memory are scripts using.' },
  room_quota: {
    labelKeys: ['role', 'room'],
    unit: 'number',
    description: 'The maximum limit of creeps that may be spawned in this role or room.',
  },
  assigned_room_count: {
    labelKeys: ['role', 'room'],
    unit: 'number',
    description: 'The living number of creeps currently spawned by assigned room.',
  },
  lifetime_idle_ticks: {
    labelKeys: ['role', 'room'],
    unit: 'ticks',
    description: 'The total number of ticks the creep spent idle over its lifetime.',
  },
  lifetime_stuck_ticks: {
    labelKeys: ['role', 'room'],
    unit: 'ticks',
    description: 'The total number of ticks the creep intended to move but failed to over its lifetime.',
  },
  my_creep_count: {
    labelKeys: ['role', 'room'],
    unit: 'number',
    description: 'The living number of creeps currently spawned by occupied room.',
  },
  neutral_structure_count: {
    labelKeys: ['room', 'structureType'],
    unit: 'number',
    description: 'Structures that have no owner, grouped by structure type.',
  },
  hostile_creep_count: { labelKeys: ['room'], unit: 'number', description: 'Living hostile creep count.' },
  my_structure_count: {
    labelKeys: ['room', 'structureType'],
    unit: 'number',
    description: 'Structures I own, grouped by structure type.',
  },
  hostile_structure_count: {
    labelKeys: ['room', 'structureType'],
    unit: 'number',
    description: 'Non-neutral structures owned by someone else, grouped by structure type.',
  },
  dropped_energy_amount: {
    labelKeys: ['room'],
    unit: 'number',
    description: 'Total amount of energy sitting on the ground.',
  },
  my_constructions_count: {
    labelKeys: ['room', 'structureType'],
    unit: 'number',
    description: 'Ongoing construction sites, grouped by structure type.',
  },
  capacity_of_storage: {
    labelKeys: ['room'],
    unit: 'number',
    description: 'How much space is available in room storage.',
  },
  energy_in_storage: { labelKeys: ['room'], unit: 'number', description: 'How storage space is used by energy.' },
  energy_in_spawns: { labelKeys: ['room'], unit: 'number', description: 'Total energy of all spawns and extensions.' },
  energy_in_sources: {
    labelKeys: ['room'],
    unit: 'number',
    description: 'Total amount of all energy sources in the room.',
  },
  rcl_level: { labelKeys: ['room'], unit: 'number', description: 'The current Room Control Level.' },
  rcl_progress: { labelKeys: ['room'], unit: 'number', description: 'Progress toward the next Room Control Level.' },
  rcl_progressTotal: {
    labelKeys: ['room'],
    unit: 'number',
    description: 'The Room Control Level will increase when Progress reaches this amount.',
  },
  capacity_of_spawns: {
    labelKeys: ['room'],
    unit: 'number',
    description: 'Total capacity of all spawns and extensions.',
  },
  energy_in_containers: {
    labelKeys: ['room'],
    unit: 'number',
    description: 'Total amount of energy in all containers in the room.',
  },
  energy_in_my_creeps: {
    labelKeys: ['room'],
    unit: 'number',
    description: 'Total amount of energy my creeps are carrying in the room.',
  },
  energy_in_links: {
    labelKeys: ['room'],
    unit: 'number',
    description: 'Total amount of energy sitting in links in the room.',
  },
  spawns_in_progress: {
    labelKeys: ['room'],
    unit: 'number',
    description: 'Total amount of spawns in the spawning state.',
  },
  event_counts_total: {
    labelKeys: ['room', 'event_type'],
    unit: 'number',
    description: 'Total number of times an event occured.',
  },
  event_amounts_total: {
    labelKeys: ['room', 'event_type'],
    unit: 'number',
    description: 'Sum of amount for all occurences of event.',
  },
} as const;

export type ColonyStats = StatsFrame<ColonyStatsData>;
export function GetColonyStats(colony: Colony): ColonyStats {
  const resources: NumericRecord = {};
  for (const r of Object.entries(Game.resources)) resources[r[0]] = r[1] as number;

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
      time: Game.time,
      last_reset_time: Memory.stats?.data.last_reset_time ?? Game.time, // Carry forward unmodified time
      visible_rooms_count: Object.keys(Game.rooms).length,
      gcl: { level: Game.gcl.level, progress: Game.gcl.progress, progressTotal: Game.gcl.progressTotal },
      gpl: { level: Game.gpl.level, progress: Game.gpl.progress, progressTotal: Game.gpl.progressTotal },
      cpu: {
        unusedBucket: Game.cpu.bucket,
        used: Game.cpu.getUsed(),
        limit: Game.cpu.limit,
        tickLimit: Game.cpu.tickLimit,
      },
      resources,
      meminfo,
      room_quota: colony.MapNameable(Object.values(colony.Roles), r =>
        colony.MapNameable(colony.MyRooms, ro => r.GetRoomQuota(ro)),
      ),
      assigned_room_count: colony.MapNameable(Object.values(colony.Roles), r =>
        colony.MapNameable(colony.MyRooms, ro => r.GetRoomCreepsInRole(ro).length),
      ),
      lifetime_idle_ticks: colony.MapNameable(Object.values(colony.Roles), r =>
        colony.MapNameable(colony.MyRooms, ro => sum(r.GetRoomCreepsInRole(ro), cir => cir.LifetimeIdle)),
      ),
      lifetime_stuck_ticks: colony.MapNameable(Object.values(colony.Roles), r =>
        colony.MapNameable(colony.MyRooms, ro => sum(r.GetRoomCreepsInRole(ro), cir => cir.LifetimeStuck)),
      ),
      my_creep_count: colony.MapNameable(Object.values(colony.Roles), r =>
        colony.MapNameable(
          colony.MyRooms,
          ro => ro.find(FIND_MY_CREEPS, { filter: c => c.memory.role === r.name }).length,
        ),
      ),
      neutral_structure_count: colony.MapNameable(Object.values(Game.rooms), vr =>
        vr.find(FIND_STRUCTURES, { filter: s => !('owner' in s) }).reduce((counts, s) => {
          counts[s.structureType] = (counts[s.structureType] ?? 0) + 1;
          return counts;
        }, {} as NumericRecord),
      ),
      hostile_creep_count: colony.MapNameable(Object.values(Game.rooms), vr => vr.find(FIND_HOSTILE_CREEPS).length),
      my_structure_count: colony.MapNameable(Object.values(Game.rooms), vr =>
        vr.find(FIND_MY_STRUCTURES).reduce((counts, s) => {
          counts[s.structureType] = (counts[s.structureType] ?? 0) + 1;
          return counts;
        }, {} as NumericRecord),
      ),
      hostile_structure_count: colony.MapNameable(Object.values(Game.rooms), vr =>
        vr.find(FIND_HOSTILE_STRUCTURES).reduce((counts, s) => {
          counts[s.structureType] = (counts[s.structureType] ?? 0) + 1;
          return counts;
        }, {} as NumericRecord),
      ),
      dropped_energy_amount: colony.MapNameable(Object.values(Game.rooms), vr =>
        sum(vr.find(FIND_DROPPED_RESOURCES), r => (r.resourceType === RESOURCE_ENERGY ? r.amount : 0)),
      ),
      my_constructions_count: colony.MapNameable(Object.values(Game.rooms), vr =>
        vr.find(FIND_MY_CONSTRUCTION_SITES).reduce((counts, s) => {
          counts[s.structureType] = (counts[s.structureType] ?? 0) + 1;
          return counts;
        }, {} as NumericRecord),
      ),
      capacity_of_storage: colony.MapNameable(Object.values(Game.rooms), vr => vr.storage?.store.getCapacity() ?? 0),
      energy_in_storage: colony.MapNameable(
        Object.values(Game.rooms),
        vr => vr.storage?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0,
      ),
      energy_in_spawns: colony.MapNameable(Object.values(Game.rooms), vr => vr.energyAvailable),
      energy_in_sources: colony.MapNameable(Object.values(Game.rooms), vr =>
        sum(vr.find(FIND_SOURCES).map(s => s.energy)),
      ),
      capacity_of_spawns: colony.MapNameable(Object.values(Game.rooms), vr => vr.energyCapacityAvailable),
      energy_in_containers: colony.MapNameable(Object.values(Game.rooms), vr =>
        sum(
          vr
            .find(FIND_STRUCTURES)
            .map(s => (s.structureType === STRUCTURE_CONTAINER ? s.store.getUsedCapacity(RESOURCE_ENERGY) : 0)),
        ),
      ),
      energy_in_my_creeps: colony.MapNameable(Object.values(Game.rooms), vr =>
        sum(vr.find(FIND_MY_CREEPS).map(s => s.store.getUsedCapacity(RESOURCE_ENERGY))),
      ),
      energy_in_links: colony.MapNameable(Object.values(Game.rooms), vr =>
        sum(
          vr
            .find(FIND_STRUCTURES)
            .map(s => (s.structureType === STRUCTURE_LINK ? s.store.getUsedCapacity(RESOURCE_ENERGY) : 0)),
        ),
      ),
      spawns_in_progress: colony.MapNameable(
        Object.values(Game.rooms),
        vr => vr.find(FIND_MY_SPAWNS).filter(s => s.spawning !== null && s.spawning !== undefined).length,
      ),
      rcl_progressTotal: colony.MapNameable(colony.MyRooms, mr => mr.controller?.progressTotal ?? 0),
      rcl_progress: colony.MapNameable(colony.MyRooms, mr => mr.controller?.progress ?? 0),
      rcl_level: colony.MapNameable(colony.MyRooms, mr => mr.controller?.level ?? 0),
      event_counts_total: colony.MapNameable(colony.MyRooms, mr => mr.EventCounts),
      event_amounts_total: colony.MapNameable(colony.MyRooms, mr => mr.EventAmounts),
    },
  };
}
/* eslint-enable camelcase */
