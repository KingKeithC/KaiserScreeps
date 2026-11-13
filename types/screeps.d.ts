import type { Dictionary } from 'lodash';
import type { CreepTask } from '../src/tasks/types';
import type { ColonyStats } from '../src/Stats';
import type { RoomPositionString } from '../src/utils/Collections';
import type { MiningPosition, RoomReport } from '../src/utils/RoomUtils';

declare global {
  interface CreepMemory {
    role?: string;
    room?: string;
    currentTask?: CreepTask | null;
    stuckTicks?: number;
    lastPos?: RoomPositionString;
    moveMode?: 'long' | 'avoidCreeps';
    successfulAvoidMoves?: number;
    spawning?: boolean;
    lifetimeIdle?: number;
    lifetimeStuck?: number;
    intendedToMove?: boolean;
    _move?: { dest: { x: number; y: number; room: string }; time: number; path: string; room: string };
  }

  interface FlagMemory {
    attackIndex?: number;
    attackType?: 'Rally' | 'NearestStructure' | 'Creeps';
    done?: boolean;
  }

  interface Memory {
    profiler: object;
    rooms: Record<Room['name'], RoomMemory>;
    flags: Record<Flag['name'], FlagMemory>;
    creeps: Record<Creep['name'], CreepMemory>;
    terminals: Record<Id<StructureTerminal>, TerminalMemory>;
    globalEnableProfiling?: boolean;
    globalEnableErrorMapper?: boolean;
    globalEnablePathVisuals?: boolean;
    scoutingReports?: Dictionary<RoomReport>;
    scoutInterval?: number;
    username?: string;
    colonyStateReportFrequency?: number;
    stats?: ColonyStats;
    logLevelName?: string;
    logFormat?: string;
    cpuSkipRatio?: number;
    minCpuBucket?: number;
    tradeEnabled?: boolean;
    profitableAbovePPU?: number;
    profitableAboveUnits?: number;
    lowCostFullfill?: number;
    tradeLockoutDuration?: number;
    allies?: string[];
    rivals?: string[];
  }

  interface RoomMemory {
    lastSpawnTick?: Record<string, number>;
    roleLimits?: Record<string, number>;
    enableVisuals?: boolean;
    enableRepairOverlay?: boolean;
    foreverRepair?: boolean;
    attackHostiles?: boolean;
    disableWarriors?: boolean;
    disableTowers?: boolean;
    disableTowerAttacks?: boolean;
    towerAttackRange?: number;
    towerAttackRangeTiles?: number;
    eventCounts?: Dictionary<number>;
    eventAmounts?: Dictionary<number>;
    towerCriticalSupplyRatio?: number;
    hostileNotificationThreshold?: number;
    claimedNearby?: string[];
    mines?: MiningPosition[];
    storageWartimeEnergyBuffer?: number;
    linkGroups?: Dictionary<Id<StructureLink>[]>;
    enableCostMatrixOverlay?: boolean;
    pathfindingCostMatrixDate?: number;
    pathfindingCostMatrix?: number[];
    storeOverUpgrade?: boolean;
    allowStorageDraw?: boolean;
    lastViewed?: number;
    minHostilesForResponse?: number;
  }

  interface TerminalMemory {
    roomName: Room['name'];
    lastInventory: StoreDefinition;
  }
}

export {};
