// scanner.js
import fetch from 'node-fetch';
import { isEventLocked } from './state.js';
const DELAY_MS = 100; // 100ms delay between requests

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function scan(config) {
    console.log('🔍 Starting scan...');

    const discovery = await fetchAllEvents();
    console.log(`📥 Fetched ${discovery.events.length} events`);

    const eligible = [];
    let checked = 0;
    let lockedCount = 0;
    let timeFilterCount = 0;
    let skippedSlugCount = 0;
    let probFilterCount = 0;
    let liquidityFilterCount = 0;

    for (const event of discovery.events) {
        checked++;

        if (checked % 500 === 0) {
            console.log(`   ... checked ${checked}/${discovery.events.length} events`);
        }

        if (isEventLocked(event.eventId)) {
            lockedCount++;
            continue;
        }

        for (const m of event.markets) {
            if (shouldSkipMarket(m.slug)) {
                skippedSlugCount++;
                continue;
            }

            let market;
            try {
                market = await fetchMarketBySlug(m.slug);
            } catch (err) {
                console.log(`⚠️  Failed to fetch market: ${m.slug}`);
                continue;
            }

            if (!market?.outcomePrices || !market?.endDate) continue;

            // ✅ FIX: Check MARKET endDate, not event endDate
            const hrs = hoursUntil(market.endDate);
            if (hrs <= 0 || hrs > config.MAX_HOURS_TO_CLOSE) {
                timeFilterCount++;
                continue;
            }

            const prices = JSON.parse(market.outcomePrices).map(Number);
            const tokens = JSON.parse(market.clobTokenIds);

            for (const side of ['YES', 'NO']) {
                const prob = side === 'YES' ? prices[0] : 1 - prices[0];

                if (prob < config.MIN_PROBABILITY || prob > config.MAX_PROBABILITY) {
                    probFilterCount++;
                    continue;
                }

                let book;
                try {
                    book = await fetchOrderbook(tokens[side === 'YES' ? 0 : 1]);
                } catch (err) {
                    console.log(`⚠️  Failed to fetch orderbook for ${m.slug} ${side}`);
                    continue;
                }

                if (!book.asks?.length) continue;

                const bestAsk = Math.min(...book.asks.map(a => Number(a.price)));

                if (bestAsk < config.MIN_PROBABILITY || bestAsk > config.MAX_PROBABILITY) {
                    probFilterCount++;
                    continue;
                }

                const size = book.asks.filter(a => Number(a.price) === bestAsk)
                    .reduce((s, a) => s + Number(a.size), 0);

                const liquidity = bestAsk * size;

                if (liquidity < config.MIN_LIQUIDITY_USD) {
                    liquidityFilterCount++;
                    continue;
                }

                eligible.push({
                    eventId: event.eventId,
                    marketId: market.id,
                    slug: m.slug,
                    side,
                    tokenId: tokens[side === 'YES' ? 0 : 1],
                    probability: prob,
                    bestAsk,
                    askSize: size,
                    hoursToClose: hrs,
                    endDate: market.endDate  // Store market endDate
                });

                console.log(`✅ Found: ${m.slug} ${side} @ ${bestAsk.toFixed(3)} | Prob: ${prob.toFixed(3)} | ${hrs.toFixed(1)}h | Liq: $${liquidity.toFixed(2)}`);
            }
        }
    }

    console.log('\n📊 Filter Summary:');
    console.log(`   Locked events: ${lockedCount}`);
    console.log(`   Time filter (>${config.MAX_HOURS_TO_CLOSE}h): ${timeFilterCount}`);
    console.log(`   Skipped slugs (15m/spl/etc): ${skippedSlugCount}`);
    console.log(`   Probability filter: ${probFilterCount}`);
    console.log(`   Liquidity filter (<$${config.MIN_LIQUIDITY_USD}): ${liquidityFilterCount}`);
    console.log(`   ✅ Eligible: ${eligible.length}\n`);

    return eligible;
}

function shouldSkipMarket(slug) {
    return /15m|spl|1pt5|2pt5|3pt5|4pt5|win|lose|draw/.test(slug);
}

function hoursUntil(iso) {
    return (new Date(iso) - Date.now()) / 36e5;
}

async function fetchAllEvents() {
    const events = [];
    let offset = 0;

    while (true) {
        let batch;
        try {
            const res = await fetch(`https://gamma-api.polymarket.com/events?closed=false&limit=100&offset=${offset}`);
            batch = await res.json();
        } catch (err) {
            console.log(`⚠️  Failed to fetch events at offset ${offset}`);
            break;
        }

        if (!batch?.length) break;

        events.push(...batch.filter(e => e.markets?.length).map(e => ({
            eventId: e.id,
            slug: e.slug,
            endDate: e.endDate,
            markets: e.markets.map(m => ({ id: m.id, slug: m.slug }))
        })));

        offset += 100;

        if (batch.length < 100) break; // Last page
    }

    return { events };
}

async function fetchMarketBySlug(slug) {
    const res = await fetch(`https://gamma-api.polymarket.com/markets?slug=${slug}`);
    const data = await res.json();
    return data[0];
}

async function fetchOrderbook(tokenId) {
    const res = await fetch(`https://clob.polymarket.com/book?token_id=${tokenId}`);
    return res.json();
}