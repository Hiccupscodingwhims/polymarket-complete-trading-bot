// monitor.js
import fetch from 'node-fetch';
import { state, closePosition, save } from './state.js';
import { logTrade } from './logger.js';

const FEE_RATE = 0.00;

export async function monitor(config) {
  for (const p of state.positions) {
    await checkStopLoss(p, config);
    await checkResolution(p);
  }
  save();
}

async function checkStopLoss(p, config) {
  const market = await fetchMarketById(p.marketId).catch(() => null);
  if (!market?.outcomePrices) return;

  const prices = JSON.parse(market.outcomePrices);
  const currentProb = p.side === 'YES' ? Number(prices[0]) : 1 - Number(prices[0]);
  const probDrop = p.entryProb - currentProb;

  if (probDrop < config.STOP_PROB_DROP) return;

  const book = await fetchOrderbook(p.tokenId).catch(() => null);
  if (!book?.bids?.length) return;

  const bestBid = Math.max(...book.bids.map(b => Number(b.price)));
  const payout = p.size * bestBid;
  const pnl = payout - p.cost - payout * FEE_RATE;

  state.wallet.balance += payout;
  closePosition(p.id, 'STOP_LOSS', payout, pnl);
  
  logTrade(p, 'STOP_LOSS', payout, pnl);
  console.log(`🛑 STOP ${p.slug} | P&L: $${pnl.toFixed(2)}`);
}

async function checkResolution(p) {
  const market = await fetchMarketById(p.marketId).catch(() => null);
  if (!market?.closed) return;

  const prices = JSON.parse(market.outcomePrices);
  let resolution = prices[0] === '1' ? 'YES' : prices[1] === '1' ? 'NO' : null;
  if (!resolution) return;

  const won = (p.side === 'YES' && resolution === 'YES') || (p.side === 'NO' && resolution === 'NO');
  const payout = won ? p.size : 0;
  const pnl = payout - p.cost - payout * FEE_RATE;

  state.wallet.balance += payout;
  closePosition(p.id, resolution, payout, pnl);
  
  logTrade(p, resolution, payout, pnl);
  console.log(`✅ RESOLVED ${p.slug} ${resolution} | P&L: $${pnl.toFixed(2)}`);
}

async function fetchMarketById(id) {
  return fetch(`https://gamma-api.polymarket.com/markets?id=${id}`).then(r => r.json()).then(d => d[0]);
}

async function fetchOrderbook(tokenId) {
  return fetch(`https://clob.polymarket.com/book?token_id=${tokenId}`).then(r => r.json());
}