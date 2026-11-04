import { Colony } from 'Colony';
import { sortBy } from 'lodash';
import { RoomExtra } from 'Room';
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

  fulfillableQty: number;
  isProfitable: boolean;
  estProfit: number;
  estProfitPerUnit: number;
  costToTransact: number;
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

  IgnoreProfitPerUnitOnSellUnder = 100;
  TradeEnabled = false;

  // 'Opportunity: ${estProfit} (${estProfitPerUnit}/u) of ${resourceType} sell ${fulfillableQty} @ ${price} from ${origin} to ${dest}: ${order}',
  RefreshWatchedOrders(terminal: StructureTerminal): void {
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

        const estProfit = fulfillableQty * o.price;
        const estProfitPerUnit = estProfit / fulfillableQty;
        const isProfitable = estProfit < this.IgnoreProfitPerUnitOnSellUnder;

        if (!isProfitable) continue;

        this.WatchedOrders.set(o.id, {
          order: o,
          time: Game.time,
          terminal: terminal.id,
          terminalRoom: terminal.room.name,
          costToTransact: Game.market.calcTransactionCost(fulfillableQty, terminal.room.name, o.roomName),
          fulfillableQty,
          isProfitable,
          estProfit,
          estProfitPerUnit,
        });
      }
  }

  InitializeTerminal(terminal: StructureTerminal): TerminalMemory {
    return { roomName: terminal.room.name, lastInventory: terminal.store };
  }

  UpdateTerminal(terminal: StructureTerminal): void {
    Memory.terminals[terminal.id].lastInventory = terminal.store;
  }

  ExecuteDeals(room: RoomExtra, terminal: StructureTerminal): void {
    const orders = Array.from(this.WatchedOrders.values()).sort(
      (o2, o1) => o1.estProfitPerUnit / o1.costToTransact - o2.estProfitPerUnit / o2.costToTransact,
    );

    // Execute First deal from best to worst
    for (const o of orders) {
      if (
        o.isProfitable &&
        terminal.store.getUsedCapacity(RESOURCE_ENERGY) >= o.costToTransact &&
        o.terminalRoom === room.name
      ) {
        const deal = Game.market.deal(o.order.id, o.fulfillableQty, room.name);
        if (deal === OK) {
          Logger.crit('Deal!!! ${details}', { '<room>': room, details: o });
          return;
        } else Logger.warn('Deal fell through due to ${rc}: ${details}', { '<room>': room, rc: deal, details: o });
      }
    }
  }

  OncePerRoom(room: RoomExtra) {
    if (room.terminal === undefined) return;
    Memory.terminals[room.terminal.id] ??= this.InitializeTerminal(room.terminal);
    this.RefreshWatchedOrders(room.terminal);
    if (this.TradeEnabled) this.ExecuteDeals(room, room.terminal);
    this.UpdateTerminal(room.terminal);
  }
}
