// logger.js
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export async function logTrade(pos, resolution, payout, pnl) {
  try {
    const { error } = await supabase
      .from('trades')
      .insert({
        timestamp: new Date().toISOString(),
        slug: pos.slug,
        side: pos.side,
        entry_price: pos.entryPrice,
        size: pos.size,
        cost: pos.cost,
        resolution,
        payout,
        pnl
      });

    if (error) console.error('Supabase insert error:', error.message);
  } catch (err) {
    console.error('Failed to log trade:', err.message);
  }
}
