import { Colony } from 'Colony';
import { RoomExtra } from 'Room';
import { Sorts } from 'utils/Collections';
import { Logger } from 'utils/Logger';

declare global {
  interface TerminalMemory {
    roomName: Room['name'];
    lastInventory: StoreDefinition;
  }
}

interface OrderAnalysis {
  time: number;
  terminal: Id<StructureTerminal>;
  terminalRoom: Room['name'];
  order: Order;

  age: number;
  fulfillableQty: number;
  isProfitable: boolean;
  estProfit: number;
  estProfitPerUnit: number;
  costToTransact: number;
  linearDist: number;
}

export class TradingSystem {
  constructor(private colony: Colony) {}

  WatchedOrders: Map<Order['id'], OrderAnalysis> = new Map();

  OncePerTick(): void {
    Memory.terminals ??= {};
    // Gather list of best trades from the market
    // Inspect Terminals lastInventory to determine what can be dealt
    return;
  }

  get TradeEnabled(): boolean {
    return ((Memory as typeof Memory & { tradeEnabled?: boolean }).tradeEnabled ??= true);
  }

  get ProfitableAbovePPU(): number {
    return ((Memory as typeof Memory & { profitableAbovePPU?: number }).profitableAbovePPU ??= 20);
  }

  get ProfitableAboveUnits(): number {
    return ((Memory as typeof Memory & { profitableAboveUnits?: number }).profitableAboveUnits ??= 200);
  }

  get LowCostFullfill(): number {
    return ((Memory as typeof Memory & { lowCostFullfill?: number }).lowCostFullfill ??= 20);
  }

  get TradeLockoutDuration(): number {
    return ((Memory as typeof Memory & { tradeLockoutDuration?: number }).tradeLockoutDuration ??= 100);
  }

  // 'Opportunity: ${estProfit} (${estProfitPerUnit}/u) of ${resourceType} sell ${fulfillableQty} @ ${price} from ${origin} to ${dest}: ${order}',
  RefreshWatchedOrders(terminal: StructureTerminal): void {
    if (this.WatchedOrders.size > 0) return;

    Logger.info('Refreshing List of Watched Market Orders.', { '<room>': terminal.room, terminal });

    for (const rt in terminal.store)
      for (const o of Game.market.getAllOrders({ type: ORDER_BUY, resourceType: rt as ResourceConstant })) {
        // Not sure why it would be undefined, but we can't calc a distance so skip it
        if (o.roomName === undefined) continue;

        // Exclude sell orders, we want to do the selling
        if (o.type !== 'buy') continue;

        // Exclude orders that we can't fulfil
        if (
          !(o.resourceType in terminal.store) ||
          o.resourceType === ACCESS_KEY ||
          o.resourceType === SUBSCRIPTION_TOKEN ||
          o.resourceType === CPU_UNLOCK ||
          o.resourceType === PIXEL ||
          o.resourceType === undefined
        )
          continue;

        // Exclude if terminal lacks capacity
        const fulfillableQty = Math.min(o.remainingAmount, terminal.store.getUsedCapacity(o.resourceType));
        if (fulfillableQty <= 0) continue;

        const estRevenue = fulfillableQty * o.price;
        const costToTransact = Game.market.calcTransactionCost(fulfillableQty, terminal.room.name, o.roomName);
        const estProfit = estRevenue - costToTransact;
        const estProfitPerUnit = estProfit / fulfillableQty;
        const linearDist = Game.map.getRoomLinearDistance(terminal.room.name, o.roomName);
        const isProfitable =
          // Profitable if at a high qty and profit ratio
          (estProfitPerUnit > this.ProfitableAbovePPU && fulfillableQty > this.ProfitableAboveUnits) ||
          // Profitable if we stand to make anything on low cost orders.
          (estProfitPerUnit > 0 && costToTransact < this.LowCostFullfill);

        if (!isProfitable) continue;

        this.WatchedOrders.set(o.id, {
          order: o,
          time: Game.time,
          terminal: terminal.id,
          terminalRoom: terminal.room.name,
          age: Game.time - o.created,
          linearDist,
          costToTransact,
          fulfillableQty,
          isProfitable,
          estProfit,
          estProfitPerUnit,
        });
      }
  }

  GetWatchedOrders(): OrderAnalysis[] {
    return Array.from(this.WatchedOrders.values()).sort(Sorts.EstimatedProfitDesc);
  }

  InitializeTerminal(terminal: StructureTerminal): TerminalMemory {
    return { roomName: terminal.room.name, lastInventory: terminal.store };
  }

  UpdateTerminal(terminal: StructureTerminal): void {
    Memory.terminals[terminal.id].lastInventory = terminal.store;
  }

  private tradeLockout: { [terminalId: string]: number } = {};
  ExecuteBestDeal(room: RoomExtra, terminal: StructureTerminal): void {
    if (terminal.cooldown) return;
    if (this.tradeLockout[terminal.id] && Game.time < this.tradeLockout[terminal.id]) return;

    const o = this.GetWatchedOrders().pop();
    if (o === undefined) return;
    this.WatchedOrders.delete(o.order.id);

    if (
      o.isProfitable &&
      terminal.store.getUsedCapacity(RESOURCE_ENERGY) >= o.fulfillableQty + o.costToTransact &&
      o.terminalRoom === room.name
    ) {
      const deal = Game.market.deal(o.order.id, o.fulfillableQty, room.name);
      if (deal === OK) {
        Logger.crit('Market deal completed.', { '<room>': room, deal: o, remaining: this.WatchedOrders.size });
        this.tradeLockout[terminal.id] = Game.time + this.TradeLockoutDuration;
        return;
      } else
        Logger.warn('Market deal failed.', {
          '<room>': room,
          result: deal,
          deal: o,
          remaining: this.WatchedOrders.size,
        });
    }
  }

  OncePerRoom(room: RoomExtra) {
    if (room.terminal === undefined) return;
    Memory.terminals[room.terminal.id] ??= this.InitializeTerminal(room.terminal);
    this.RefreshWatchedOrders(room.terminal);
    if (this.TradeEnabled) this.ExecuteBestDeal(room, room.terminal);
    this.UpdateTerminal(room.terminal);
  }
}
