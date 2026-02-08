// engine.js
import express from 'express';
import { load, save, state } from './state.js';
import { scan } from './scanner.js';
import { execute } from './executor.js';
import { monitor } from './monitor.js';

const config = {
  MAX_HOURS_TO_CLOSE: 4,
  MIN_PROBABILITY: 0.80,
  MAX_PROBABILITY: 0.96,
  MIN_LIQUIDITY_USD: 2,
  STOP_PROB_DROP: 0.25,
  PER_MARKET_CAP: 2
};

const CYCLE_INTERVAL = 60 * 60 * 1000; // 1 minute

// HTTP endpoint
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/state', (req, res) => {
  res.json({
    balance: state.wallet.balance,
    positions: state.positions.length,
    closedPositions: state.closedPositions.length,
    eventLocks: state.eventLocks.size,
    realizedPnL: state.closedPositions.reduce((sum, p) => sum + p.pnl, 0).toFixed(2),
    totalValue: (state.wallet.balance + state.positions.reduce((s, p) => s + p.cost, 0)).toFixed(2),
    openTrades: state.positions.map(p => ({
      slug: p.slug,
      side: p.side,
      entryPrice: p.entryPrice,
      size: p.size,
      cost: p.cost
    })),
    allClosedTrades: state.closedPositions.map(p => ({
      slug: p.slug,
      side: p.side,
      resolution: p.resolution,
      pnl: p.pnl.toFixed(2),
      closedAt: p.closedAt
    }))
  });
});

app.listen(PORT, () => {
  const url = process.env.RAILWAY_STATIC_URL 
    ? `https://${process.env.RAILWAY_STATIC_URL}/state`
    : `http://localhost:${PORT}/state`;
  console.log(`🌐 State endpoint: ${url}`);
});

async function cycle() {
  try {
    console.log(`\n[${new Date().toLocaleTimeString()}] Running cycle...`);
    console.log(`💰 Wallet: $${state.wallet.balance.toFixed(2)} | Positions: ${state.positions.length}`);

    await monitor(config);
    const markets = await scan(config);
    console.log(`📊 Eligible markets: ${markets.length}`);

    if (markets.length > 0) {
      execute(markets, config);
    }

    save();
    
    // Log state summary
    console.log(`📊 State: Balance=$${state.wallet.balance.toFixed(2)} | Open=${state.positions.length} | Closed=${state.closedPositions.length} | Locks=${state.eventLocks.size}`);
  } catch (err) {
    console.error('❌ Cycle error:', err.message);
  }
}

try {
  load();
  console.log('🚀 Engine started');
  console.log(`💰 Starting balance: $${state.wallet.balance.toFixed(2)}`);
  console.log(`📦 Loaded ${state.positions.length} open positions`);
  console.log(`🔒 Locked events: ${state.eventLocks.size}`);
} catch (err) {
  console.error('❌ Failed to load state:', err.message);
  process.exit(1);
}

cycle().catch(err => {
  console.error('❌ Initial cycle failed:', err);
});

setInterval(() => {
  cycle().catch(err => {
    console.error('❌ Cycle failed:', err);
  });
}, CYCLE_INTERVAL);

process.stdin.resume();

console.log(`⏰ Cycle interval: ${CYCLE_INTERVAL / 1000}s`);
console.log('Press Ctrl+C to stop\n');