import { useState, useMemo, useEffect } from "react";
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea, Legend
} from "recharts";

// ── Risk Metric ───────────────────────────────────────────────────────────
// Uses 365-day rolling geometric mean as trend.
// risk = (log10(price / MA365) + 0.5431) / 1.285
// Calibrated so that:
//   Nov 2022 $16k (MA~$32k) → risk 0.197  (8x zone)
//   Jun 2022 $22k (MA~$41k) → risk 0.192  (8x zone)
//   Apr 2023 $30k (MA~$22k) → risk 0.532  (above buy zone)
//   Feb 2026 $69k (MA~$95k) → risk 0.314  (2x zone)
function calcRisk(price, ma365) {
  if (!ma365 || ma365 <= 0) return 0.5;
  const logRatio = Math.log10(price / ma365);
  // A=0.4647, B=1.0013 — calibrated so Jun/Jul/Nov 2022 land in 8x zone
  // Jun 2022 $22k → 0.155 (8x), Jul 2022 $19k → 0.118 (8x), Feb 2026 $69k → 0.324 (2x)
  return Math.min(1, Math.max(0, (logRatio + 0.4647) / 1.0013));
}

// Compute 365-day rolling geometric mean and attach risk to each data point
function addMovingAverage(data) {
  const WINDOW = 500; // 500-day geometric MA — sticky enough to stay high through 2022 bear
  let logSum = 0;
  return data.map((d, i) => {
    logSum += Math.log10(Math.max(d.price, 1));
    if (i >= WINDOW) logSum -= Math.log10(Math.max(data[i - WINDOW].price, 1));
    const ma = Math.pow(10, logSum / Math.min(i + 1, WINDOW));
    return { ...d, ma365: ma, risk: parseFloat(calcRisk(d.price, ma).toFixed(4)) };
  });
}

const RISK_BANDS = [
  { label: "0.0 – 0.099", min: 0,   max: 0.1 },
  { label: "0.1 – 0.199", min: 0.1, max: 0.2 },
  { label: "0.2 – 0.299", min: 0.2, max: 0.3 },
  { label: "0.3 – 0.399", min: 0.3, max: 0.4 },
  { label: "0.4 – 0.499", min: 0.4, max: 0.5 },
  { label: "0.5 – 0.599", min: 0.5, max: 0.6 },
  { label: "0.6 – 0.699", min: 0.6, max: 0.7 },
];

function fmt$(v) {
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return "$" + Math.round(v).toLocaleString();
  return "$" + v.toFixed(2);
}
function fmtDate(d) {
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

// ── Fallback data if API fails ────────────────────────────────────────────
function buildFallbackData() {
  const monthly = [
    ["2020-01-01",7200],["2020-04-01",8600],["2020-07-01",11100],["2020-10-01",13800],
    ["2021-01-01",33100],["2021-04-01",57700],["2021-07-01",41500],["2021-10-01",61300],
    ["2022-01-01",38500],["2022-04-01",38400],["2022-07-01",23400],["2022-10-01",20500],
    ["2023-01-01",23100],["2023-04-01",29200],["2023-07-01",29200],["2023-10-01",34700],
    ["2024-01-01",43000],["2024-04-01",60600],["2024-07-01",65900],["2024-10-01",72200],
    ["2025-01-01",105000],["2025-04-01",78000],["2025-07-01",88000],["2025-10-01",72000],
    ["2026-01-01",102000],["2026-02-01",68000],
  ];
  const out = [];
  for (let i = 0; i < monthly.length - 1; i++) {
    const t0 = new Date(monthly[i][0]).getTime();
    const t1 = new Date(monthly[i+1][0]).getTime();
    const p0 = monthly[i][1], p1 = monthly[i+1][1];
    const days = Math.round((t1 - t0) / 86400000);
    for (let j = 0; j < days; j++) {
      const frac = j / days;
      const ts = t0 + j * 86400000;
      const price = Math.exp(Math.log(p0) + (Math.log(p1) - Math.log(p0)) * frac);
      out.push({ ts, date: new Date(ts), price });
    }
  }
  return addMovingAverage(out);
}

// ── Main Component ────────────────────────────────────────────────────────
export default function DCASimulator() {
  const [tab, setTab] = useState("dynamic");
  const [baseAmount, setBaseAmount] = useState(1000);
  // ── Asset catalogue ───────────────────────────────────────────────────────
  const ASSETS = [
    // Crypto — Binance
    { id: "BTC",  label: "BTC (Bitcoin)", type: "binance", cgId: null, ticker: "BTCUSDT", csvUrl: null },
    { id: "SOL",  label: "SOL (Solana)",  type: "binance", cgId: null, ticker: "SOLUSDT", csvUrl: null },
    // Stocks — Yahoo Finance (alphabetical)
    { id: "AMD",   label: "AMD (Advanced Micro Devices)", type: "stock", cgId: null, ticker: "AMD"   },
    { id: "AMZN",  label: "AMZN (Amazon)",                type: "stock", cgId: null, ticker: "AMZN"  },
    { id: "AVGO",  label: "AVGO (Broadcom)",              type: "stock", cgId: null, ticker: "AVGO"  },
    { id: "BMNR",  label: "BMNR (Bitmine)",               type: "stock", cgId: null, ticker: "BMNR"  },
    { id: "BRK-B", label: "BRK.B (Berkshire Hathaway)",  type: "stock", cgId: null, ticker: "BRK-B" },
    { id: "CDNS",  label: "CDNS (Cadence Design)",        type: "stock", cgId: null, ticker: "CDNS"  },
    { id: "CEG",   label: "CEG (Constellation Energy)",   type: "stock", cgId: null, ticker: "CEG"   },
    { id: "COIN",  label: "COIN (Coinbase)",              type: "stock", cgId: null, ticker: "COIN"  },
    { id: "CRWD",  label: "CRWD (CrowdStrike)",           type: "stock", cgId: null, ticker: "CRWD"  },
    { id: "DDOG",  label: "DDOG (Datadog)",               type: "stock", cgId: null, ticker: "DDOG"  },
    { id: "GOOG",  label: "GOOG (Alphabet)",              type: "stock", cgId: null, ticker: "GOOG"  },
    { id: "HOOD",  label: "HOOD (Robinhood)",             type: "stock", cgId: null, ticker: "HOOD"  },
    { id: "IREN",  label: "IREN (Iris Energy)",           type: "stock", cgId: null, ticker: "IREN"  },
    { id: "META",  label: "META (Meta)",                  type: "stock", cgId: null, ticker: "META"  },
    { id: "MSFT",  label: "MSFT (Microsoft)",             type: "stock", cgId: null, ticker: "MSFT"  },
    { id: "MSTR",  label: "MSTR (MicroStrategy)",         type: "stock", cgId: null, ticker: "MSTR"  },
    { id: "MU",    label: "MU (Micron)",                  type: "stock", cgId: null, ticker: "MU"    },
    { id: "NFLX",  label: "NFLX (Netflix)",               type: "stock", cgId: null, ticker: "NFLX"  },
    { id: "NVDA",  label: "NVDA (Nvidia)",                type: "stock", cgId: null, ticker: "NVDA"  },
    { id: "OKLO",  label: "OKLO (Oklo)",                  type: "stock", cgId: null, ticker: "OKLO"  },
    { id: "PLTR",  label: "PLTR (Palantir)",              type: "stock", cgId: null, ticker: "PLTR"  },
    { id: "QCOM",  label: "QCOM (Qualcomm)",              type: "stock", cgId: null, ticker: "QCOM"  },
    { id: "TSLA",  label: "TSLA (Tesla)",                 type: "stock", cgId: null, ticker: "TSLA"  },
    { id: "TSM",   label: "TSM (TSMC)",                   type: "stock", cgId: null, ticker: "TSM"   },
    { id: "TTD",   label: "TTD (The Trade Desk)",         type: "stock", cgId: null, ticker: "TTD"   },
    { id: "VRT",   label: "VRT (Vertiv)",                 type: "stock", cgId: null, ticker: "VRT"   },
    // ETFs — Yahoo Finance (alphabetical)
    { id: "GDX",   label: "GDX (Gold Miners ETF)",        type: "etf", cgId: null, ticker: "GDX"   },
    { id: "GLD",   label: "GLD (Gold ETF)",               type: "etf", cgId: null, ticker: "GLD"   },
    { id: "IBIT",  label: "IBIT (Bitcoin ETF)",           type: "etf", cgId: null, ticker: "IBIT"  },
    { id: "MAGS",  label: "MAGS (Magnificent 7 ETF)",     type: "etf", cgId: null, ticker: "MAGS"  },
    { id: "SCHD",  label: "SCHD (Schwab Dividend ETF)",   type: "etf", cgId: null, ticker: "SCHD"  },
    { id: "SMH",   label: "SMH (Semiconductors ETF)",     type: "etf", cgId: null, ticker: "SMH"   },
    { id: "VOO",   label: "VOO (S&P 500 ETF)",            type: "etf", cgId: null, ticker: "VOO"   },
    { id: "XLK",   label: "XLK (Tech Sector ETF)",        type: "etf", cgId: null, ticker: "XLK"   },
  ];

  const [assetId, setAssetId] = useState("BTC");
  const asset = ASSETS.find(a => a.id === assetId) ?? ASSETS[0];

  const [frequency, setFrequency] = useState("Monthly");
  const [dayOfMonth, setDayOfMonth] = useState(13);
  const [startDate, setStartDate] = useState("2022-02-02");
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [riskBandIdx, setRiskBandIdx] = useState(4);
  const [strategy, setStrategy] = useState("Exponential");
  const [scaleY, setScaleY] = useState("Lin");
  const [riskOffset, setRiskOffset] = useState(-0.02);

  const [dailyData, setDailyData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    async function fetchAssetData() {
      try {
        setLoading(true);
        setError(null);
        setDailyData([]);
        let raw = [];

        if (asset.type === "binance") {
          // Binance public API — CORS-friendly, no key needed, full daily history
          // Fetch in batches of 1000 candles (max per request) going back to 2020
          const allCandles = [];
          let endTime = Date.now();
          const startTime = asset.id === "BTC"
            ? new Date("2017-01-01").getTime()
            : new Date("2020-01-01").getTime();
          while (endTime > startTime) {
            const url = `https://api.binance.com/api/v3/klines?symbol=${asset.ticker}&interval=1d&limit=1000&endTime=${endTime}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Binance HTTP ${res.status}`);
            const candles = await res.json();
            if (!candles.length) break;
            allCandles.unshift(...candles);
            endTime = candles[0][0] - 1; // go back before oldest candle
            if (candles.length < 1000) break; // reached the beginning
          }
          raw = allCandles.map(c => ({
            ts: c[0],
            date: new Date(c[0]),
            price: parseFloat(c[4]), // close price
          })).filter(d => d.price > 0 && d.ts >= startTime)
            .sort((a, b) => a.ts - b.ts);
          if (raw.length === 0) throw new Error("No data from Binance");
        } else if (asset.type === "crypto") {
          // CoinGecko for crypto
          const res = await fetch(
            `https://api.coingecko.com/api/v3/coins/${asset.cgId}/market_chart?vs_currency=usd&days=max&interval=daily`
          );
          if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
          const json = await res.json();
          raw = json.prices
            .filter(([ts]) => ts >= new Date("2012-01-01").getTime())
            .map(([ts, price]) => ({ ts, date: new Date(ts), price }));
        } else {
          // Yahoo Finance via Vercel proxy rewrite (vercel.json) — no CORS issues
          const res = await fetch(`/api/yahoo/${asset.ticker}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = await res.json();
          const result = json.chart?.result?.[0];
          if (!result) throw new Error("No data returned from Yahoo Finance");
          const timestamps = result.timestamp;
          const closes = result.indicators.adjclose?.[0]?.adjclose
                      ?? result.indicators.quote?.[0]?.close;
          if (!timestamps || !closes) throw new Error("Unexpected data format");
          raw = timestamps.map((ts, i) => ({
            ts: ts * 1000,
            date: new Date(ts * 1000),
            price: closes[i],
          })).filter(d => d.price != null && d.price > 0 && isFinite(d.price));
          if (raw.length === 0) throw new Error("No valid price data");
        }

        const parsed = addMovingAverage(raw);
        setDailyData(parsed);
        setLastUpdated(new Date());
      } catch (e) {
        console.error("Fetch failed:", e);
        setError(`Live data unavailable for ${asset.id} — ${e.message}. Try refreshing or selecting another asset.`);
        // Always ensure dailyData is set so render doesn't crash
        if (asset.id === "BTC") {
          setDailyData(buildFallbackData());
        } else {
          setDailyData([]);
        }
      } finally {
        setLoading(false);
      }
    }
    fetchAssetData();
  }, [assetId]);

  // Reset date range when switching assets
  useEffect(() => {
    const defaults = {
      // Crypto
      BTC: "2022-02-02", SOL: "2022-02-02",
      // Stocks
      AMD: "2022-02-02", AMZN: "2022-02-02", AVGO: "2022-02-02",
      BMNR: "2024-01-01", "BRK-B": "2022-02-02", CDNS: "2022-02-02",
      CEG: "2022-02-02", COIN: "2022-02-02", CRWD: "2022-02-02",
      DDOG: "2022-02-02", GOOG: "2022-02-02", HOOD: "2022-08-01",
      IREN: "2023-01-01", META: "2022-02-02", MSFT: "2022-02-02",
      MSTR: "2022-02-02", MU: "2022-02-02", NFLX: "2022-02-02",
      NVDA: "2022-02-02", OKLO: "2024-05-01", PLTR: "2022-02-02",
      QCOM: "2022-02-02", TSLA: "2022-02-02", TSM: "2022-02-02",
      TTD: "2022-02-02", VRT: "2022-02-02",
      // ETFs
      GDX: "2022-02-02", GLD: "2022-02-02", IBIT: "2024-01-01",
      MAGS: "2024-01-01", SCHD: "2022-02-02", SMH: "2022-02-02",
      VOO: "2022-02-02", XLK: "2022-02-02",
    };
    setStartDate(defaults[assetId] ?? "2022-02-02");
  }, [assetId]);

  const riskBand = RISK_BANDS[riskBandIdx];
  const minDate = dailyData[0]?.date.toISOString().slice(0, 10) ?? "2012-01-01";
  const maxDate = dailyData[dailyData.length - 1]?.date.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10);

  // Apply offset to all risk values in rangeData
  const rangeData = useMemo(() => {
    const s = new Date(startDate).getTime();
    const e = new Date(endDate).getTime();
    return dailyData
      .filter(d => d.ts >= s && d.ts <= e)
      .map(d => ({ ...d, risk: parseFloat(Math.min(1, Math.max(0, d.risk + riskOffset)).toFixed(4)) }));
  }, [dailyData, startDate, endDate, riskOffset]);

  function isPurchaseDay(d, freq, dom) {
    const date = d.date;
    if (freq === "Daily") return true;
    if (freq === "Weekly") return date.getDay() === 1;
    if (freq === "Monthly") return date.getDate() === dom;
    return false;
  }

  // Build exponential tiers dynamically from the selected band.
  // The selected band is the TOP tier (1x). Each 0.1 step below doubles.
  // e.g. band 0.4–0.5 → tiers: [0.4,0.5]=1x [0.3,0.4]=2x [0.2,0.3]=4x [0.1,0.2]=8x [0,0.1]=16x
  function buildExpTiers(band) {
    const tiers = [];
    const step = 0.1;
    let top = parseFloat(band.max.toFixed(3));
    let bot = parseFloat(band.min.toFixed(3));
    let mult = 1;
    // First tier = selected band itself
    tiers.push({ y1: bot, y2: top, mult });
    // Extend downward
    while (bot > 0.001) {
      const newBot = parseFloat(Math.max(0, bot - step).toFixed(3));
      mult *= 2;
      tiers.push({ y1: newBot, y2: bot, mult });
      bot = newBot;
    }
    return tiers;
  }

  const expTiers = buildExpTiers(riskBand);

  function getMultiplier(risk, band, strat) {
    if (strat === "Linear") {
      if (risk < band.min || risk >= band.max) return 0;
      return 1;
    }
    // Exponential: no buy above band.max
    if (risk >= band.max) return 0;
    // Find which tier this risk falls in
    for (const tier of expTiers) {
      if (risk >= tier.y1 && risk < tier.y2) return tier.mult;
    }
    return 0;
  }

  const simulation = useMemo(() => {
    if (!rangeData.length) return { chartData: [], riskData: [], tradeLog: [], stats: null };
    let totalInvested = 0, totalAsset = 0, buyCount = 0;
    const tradeLog = [];
    const chartData = [];
    const riskData = [];
    const lumpPrice = rangeData[0]?.price ?? 1;
    const lumpEquiv = baseAmount * Math.max(rangeData.length / 30, 1);
    const lumpAsset = lumpEquiv / lumpPrice;

    for (let i = 0; i < rangeData.length; i++) {
      const d = rangeData[i];
      let purchase = 0;
      const isLastDay = i === rangeData.length - 1;
      if (tab === "equal") {
        if (isPurchaseDay(d, frequency, dayOfMonth) && !isLastDay) purchase = baseAmount;
      } else if (tab === "lump") {
        if (i === 0) purchase = lumpEquiv;
      } else {
        if (isPurchaseDay(d, frequency, dayOfMonth) && !isLastDay) {
          const mult = getMultiplier(d.risk, riskBand, strategy);
          if (mult > 0) { purchase = baseAmount * mult; buyCount++; }
        }
      }

      // Build trade log entry on purchase days and last day
      const isBuyDay = isPurchaseDay(d, frequency, dayOfMonth);
      if (isBuyDay || isLastDay) {
        const mult = tab === "dynamic" && !isLastDay ? getMultiplier(d.risk, riskBand, strategy) : 0;
        let action = "None";
        if (!isLastDay && purchase > 0) {
          if (tab === "equal") action = "Buy 1x";
          else if (tab === "lump") action = "Lump Sum";
          else if (strategy === "Linear") action = "Buy x";
          else action = `Buy ${mult}x`;
        }
        tradeLog.push({
          date: d.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          action,
          risk: d.risk,
          price: d.price,
          purchaseAmt: purchase,
        });
      }

      if (purchase > 0) { totalInvested += purchase; totalAsset += purchase / d.price; }

      // Update tradeLog entry with running totals (after purchase)
      if (tradeLog.length > 0 && (isBuyDay || isLastDay)) {
        const last = tradeLog[tradeLog.length - 1];
        last.accumulated = totalAsset;
        last.invested = totalInvested;
        last.portfolioValue = totalAsset * d.price;
      }

      // Portfolio chart: sample every 3 days (performance)
      if (i % 3 === 0 || isLastDay) {
        chartData.push({
          ts: d.ts, label: fmtDate(d.date),
          price: Math.round(d.price),
          portfolio: totalAsset > 0 ? Math.max(1, Math.round(totalAsset * d.price)) : null,
          invested: totalInvested > 0 ? Math.max(1, Math.round(totalInvested)) : null,
          lumpSum: Math.round(lumpAsset * d.price),
        });
      }
      // Risk chart: every day for full resolution
      riskData.push({
        label: fmtDate(d.date),
        risk: d.risk,
      });
    }

    const lastPrice = rangeData[rangeData.length - 1]?.price ?? 0;
    const currentPortfolio = totalAsset * lastPrice;
    const gain = currentPortfolio - totalInvested;
    const gainPct = totalInvested > 0 ? ((currentPortfolio / totalInvested - 1) * 100).toFixed(2) : 0;
    return {
      chartData,
      riskData,
      tradeLog,
      stats: {
        totalInvested, totalAsset, avgPrice: totalAsset > 0 ? totalInvested / totalAsset : 0,
        lastPrice, currentPortfolio, gain, gainPct,
        totalMonths: Math.round(rangeData.length / 30), buyCount,
      },
    };
  }, [rangeData, tab, baseAmount, frequency, dayOfMonth, riskBand, strategy]);

  const { chartData, riskData, tradeLog, stats } = simulation;

  const inputStyle = {
    background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 6,
    color: "#e0e0ff", padding: "6px 10px", fontSize: 13,
    fontFamily: "'DM Mono', monospace", outline: "none",
  };
  const tabStyle = (t) => ({
    padding: "8px 18px", border: "none",
    borderBottom: tab === t ? "2px solid #6C8EFF" : "2px solid transparent",
    color: tab === t ? "#6C8EFF" : "#888",
    cursor: "pointer", fontSize: 13, fontFamily: "'DM Mono', monospace",
    background: "transparent", transition: "all 0.2s",
  });
  const pillBtn = (active, onClick, label) => (
    <button onClick={onClick} style={{
      padding: "5px 14px", borderRadius: 4, border: "1px solid #2a2a4a",
      background: active ? "#6C8EFF" : "#1a1a2e",
      color: active ? "#fff" : "#888",
      cursor: "pointer", fontSize: 12, fontFamily: "'DM Mono', monospace",
    }}>{label}</button>
  );

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: "#0d0d1f", border: "1px solid #2a2a4a", borderRadius: 8, padding: "10px 14px", fontSize: 12, fontFamily: "'DM Mono', monospace" }}>
        <div style={{ color: "#888", marginBottom: 4 }}>{label}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ color: p.color || "#e0e0ff" }}>
            {p.name}: {p.name === "Risk" ? p.value?.toFixed(3) : fmt$(p.value)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ background: "#07071a", minHeight: "100vh", color: "#e0e0ff", fontFamily: "'DM Mono', monospace", padding: "24px 28px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Space+Grotesk:wght@400;600;700&display=swap');
        * { box-sizing: border-box; }
        input[type=date]::-webkit-calendar-picker-indicator { filter: invert(0.7); cursor: pointer; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0d0d1f; }
        ::-webkit-scrollbar-thumb { background: #2a2a4a; border-radius: 2px; }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 26, fontWeight: 700, margin: 0, color: "#fff", letterSpacing: -0.5 }}>
            Bitcoin DCA Simulation
          </h1>
          <p style={{ color: "#666", fontSize: 12, margin: "6px 0 0" }}>
            Enter your DCA amount and parameters to simulate different accumulation strategies based on your risk tolerance.
          </p>
        </div>
        <div style={{ textAlign: "right", fontSize: 11 }}>
          {loading && <span style={{ color: "#6C8EFF" }}>{`⟳ Fetching live ${asset.label} price history...`}</span>}
          {!loading && error && <span style={{ color: "#f59e0b" }}>⚠ {error}</span>}
          {!loading && !error && lastUpdated && (
            <span style={{ color: "#22c55e" }}>✓ Live data · {lastUpdated.toLocaleTimeString()}</span>
          )}
          {!loading && <div style={{ color: "#333", fontSize: 10, marginTop: 2 }}>{dailyData.length.toLocaleString()} daily data points</div>}
        </div>
      </div>

      {/* Card */}
      <div style={{ background: "#0d0d1f", border: "1px solid #1a1a3a", borderRadius: 12, overflow: "hidden" }}>

        {/* Tabs */}
        <div style={{ borderBottom: "1px solid #1a1a3a", display: "flex", padding: "0 16px" }}>
          <button style={tabStyle("equal")} onClick={() => setTab("equal")}>DCA Equal Amount</button>
          <button style={tabStyle("lump")} onClick={() => setTab("lump")}>Lump Sum</button>
          <button style={tabStyle("dynamic")} onClick={() => setTab("dynamic")}>Dynamic DCA In</button>
        </div>

        {/* Controls */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #1a1a3a" }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>Asset</div>
              <select style={{ ...inputStyle, cursor: "pointer", minWidth: 180 }}
                value={assetId} onChange={e => setAssetId(e.target.value)}>
                <optgroup label="── Crypto">
                  {ASSETS.filter(a => a.type === "crypto" || a.type === "binance").map(a => (
                    <option key={a.id} value={a.id}>{a.label}</option>
                  ))}
                </optgroup>
                <optgroup label="── Stocks">
                  {ASSETS.filter(a => a.type === "stock").map(a => (
                    <option key={a.id} value={a.id}>{a.label}</option>
                  ))}
                </optgroup>
                <optgroup label="── ETFs">
                  {ASSETS.filter(a => a.type === "etf").map(a => (
                    <option key={a.id} value={a.id}>{a.label}</option>
                  ))}
                </optgroup>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>USD Amount *x</div>
              <input type="number" style={inputStyle} value={baseAmount || ""}
                onChange={e => {
                  const val = e.target.value;
                  if (val === "" || val === "0") { setBaseAmount(""); return; }
                  const n = Number(val);
                  if (!isNaN(n) && n >= 0) setBaseAmount(n);
                }}
                onBlur={e => {
                  // When user leaves the field, default to 100 if empty
                  if (!baseAmount || baseAmount === "") setBaseAmount(100);
                }}
                inputMode="numeric" placeholder="1000" />
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>Repeat Purchase</div>
              <select style={{ ...inputStyle, cursor: "pointer" }} value={frequency} onChange={e => setFrequency(e.target.value)}>
                <option>Daily</option><option>Weekly</option><option>Monthly</option>
              </select>
            </div>
            {frequency === "Monthly" && (
              <div>
                <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>Day of month</div>
                <select style={{ ...inputStyle, cursor: "pointer" }} value={dayOfMonth} onChange={e => setDayOfMonth(Number(e.target.value))}>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
            )}
            <div>
              <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>Starting Date</div>
              <input type="date" style={inputStyle} value={startDate}
                min={minDate} max={endDate}
                onChange={e => setStartDate(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>Ending Date</div>
              <input type="date" style={inputStyle} value={endDate}
                min={startDate} max={maxDate}
                onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>

          {tab === "dynamic" && (
            <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div>
                <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>Accumulate up to risk...</div>
                <select style={{ ...inputStyle, cursor: "pointer" }} value={riskBandIdx} onChange={e => setRiskBandIdx(Number(e.target.value))}>
                  {RISK_BANDS.map((b, i) => <option key={i} value={i}>{b.label}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>Buying strategy</div>
                <div style={{ display: "flex", gap: 4 }}>
                  {pillBtn(strategy === "Linear", () => setStrategy("Linear"), "Linear")}
                  {pillBtn(strategy === "Exponential", () => setStrategy("Exponential"), "Exponential")}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>Scale</div>
                <div style={{ display: "flex", gap: 4 }}>
                  {pillBtn(scaleY === "Lin", () => setScaleY("Lin"), "Lin")}
                  {pillBtn(scaleY === "Log", () => setScaleY("Log"), "Log")}
                </div>
              </div>
              {strategy === "Exponential" && (
                <div style={{ fontSize: 11, color: "#555", alignSelf: "flex-end", paddingBottom: 2 }}>
                  Exponentially increasing amounts: x, 2x, 4x, 8x...
                </div>
              )}
              {strategy === "Linear" && (
                <div style={{ fontSize: 11, color: "#555", alignSelf: "flex-end", paddingBottom: 2 }}>
                  {`Flat $${baseAmount.toLocaleString()} — only buys when risk is within ${riskBand.label}`}
                </div>
              )}
              <div>
                <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>
                  Risk offset <span style={{ color: "#aabbff" }}>{riskOffset >= 0 ? "+" : ""}{riskOffset.toFixed(2)}</span>
                </div>
                <input
                  type="range" min="-0.20" max="0.20" step="0.01"
                  value={riskOffset}
                  onChange={e => setRiskOffset(parseFloat(e.target.value))}
                  style={{ width: 120, accentColor: "#6C8EFF", cursor: "pointer" }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ padding: 60, textAlign: "center", color: "#6C8EFF", fontSize: 13 }}>
            {`⟳ Fetching live ${asset.label} price history...`}
          </div>
        )}

        {/* Main Content */}
        {!loading && (
          <div style={{ display: "flex" }}>
            <div style={{ flex: 1, minWidth: 0, padding: "20px" }}>

              {/* Portfolio Chart */}
              <div style={{ marginBottom: 32 }}>
                <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 500, color: "#c0c0e0", fontFamily: "'Space Grotesk', sans-serif" }}>
                  {`${asset.id} — Simulated Portfolio Value Over Time`}
                </h3>
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <defs>
                      <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6C8EFF" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#6C8EFF" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#151530" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#555" }} interval={Math.floor(chartData.length / 8)} />
                    <YAxis
                      scale={scaleY === "Log" ? "log" : "linear"}
                      domain={scaleY === "Log" ? ["auto", "auto"] : [0, "auto"]}
                      tick={{ fontSize: 10, fill: "#555" }}
                      tickFormatter={v => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v}
                      width={55}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, color: "#888" }} />
                    <Area type="monotone" dataKey="portfolio" name="Portfolio" stroke="#6C8EFF" fill="url(#portfolioGrad)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="invested" name="Invested" stroke="#888" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
                    {tab !== "lump" && (
                      <Line type="monotone" dataKey="lumpSum" name="Lump Sum" stroke="#444" strokeWidth={1} dot={false} strokeDasharray="2 4" />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Risk / Strategy Chart */}
              <div>
                <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 500, color: "#c0c0e0", fontFamily: "'Space Grotesk', sans-serif" }}>
                  {tab === "dynamic" ? "Simulated Strategy Over Time" : "Risk Metric Over Time"}
                </h3>
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={riskData} margin={{ top: 5, right: 130, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#151530" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#555" }} interval={Math.floor(riskData.length / 8)} />
                    <YAxis
                      domain={[0, 1]} width={35}
                      tick={{ fontSize: 10, fill: "#555" }}
                      tickFormatter={v => v.toFixed(1)}
                      ticks={[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]}
                    />
                    <Tooltip content={<CustomTooltip />} />

                    {/* Exponential buy tiers — dynamic from selected risk band */}
                    {tab === "dynamic" && strategy === "Exponential" && expTiers.map(({ y1, y2, mult }, idx) => {
                      // Lightest at top tier, darkest at bottom
                      const alpha = 0.13 + (idx / Math.max(expTiers.length - 1, 1)) * 0.33;
                      return (
                        <ReferenceArea
                          key={mult} y1={y1} y2={y2}
                          fill="#22c55e" fillOpacity={alpha}
                          stroke="#22c55e" strokeOpacity={0.35} strokeWidth={0.5}
                          label={{
                            value: `Buy $${(baseAmount * mult).toLocaleString()} (${mult}x)`,
                            fill: "#4ade80", fontSize: 9,
                            fontFamily: "'DM Mono', monospace",
                            position: "insideRight",
                          }}
                        />
                      );
                    })}

                    {/* Linear mode */}
                    {tab === "dynamic" && strategy === "Linear" && (
                      <ReferenceArea
                        y1={riskBand.min} y2={riskBand.max}
                        fill="#22c55e" fillOpacity={0.25}
                        stroke="#22c55e" strokeOpacity={0.5} strokeWidth={1}
                        label={{
                          value: `Buy $${baseAmount.toLocaleString()} (1x)`,
                          fill: "#4ade80", fontSize: 9,
                          fontFamily: "'DM Mono', monospace",
                          position: "insideRight",
                        }}
                      />
                    )}

                    <Line type="monotone" dataKey="risk" name="Risk" stroke="#aabbff" strokeWidth={1.5} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Stats Panel */}
            {stats && (
              <div style={{ width: 210, borderLeft: "1px solid #1a1a3a", padding: "24px 20px", display: "flex", flexDirection: "column", gap: 24 }}>
                <div>
                  <div style={{ fontSize: 10, color: "#555", marginBottom: 4 }}>Total Invested</div>
                  <div style={{ fontSize: 24, fontWeight: 600, color: "#fff", fontFamily: "'Space Grotesk', sans-serif" }}>
                    {fmt$(stats.totalInvested)}
                  </div>
                  <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>
                    {tab === "dynamic"
                      ? `Buying ${stats.buyCount} of ${stats.totalMonths} months`
                      : `Over ${stats.totalMonths} months`}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 10, color: "#555", marginBottom: 4 }}>Accumulated Asset</div>
                  <div style={{ fontSize: 20, fontWeight: 600, color: "#fff", fontFamily: "'Space Grotesk', sans-serif" }}>
                    {stats.totalAsset.toFixed(5)} <span style={{ fontSize: 12, color: "#888" }}>{asset.id}</span>
                  </div>
                  <div style={{ fontSize: 10, color: "#666", marginTop: 4 }}>Average: {fmt$(stats.avgPrice)}</div>
                  <div style={{ fontSize: 10, color: "#666" }}>Last: {fmt$(stats.lastPrice)}</div>
                </div>

                <div>
                  <div style={{ fontSize: 10, color: "#555", marginBottom: 4 }}>Current Portfolio Value</div>
                  <div style={{ fontSize: 20, fontWeight: 600, color: "#fff", fontFamily: "'Space Grotesk', sans-serif" }}>
                    {fmt$(stats.currentPortfolio)}
                  </div>
                  <div style={{ fontSize: 11, marginTop: 4, color: stats.gain >= 0 ? "#22c55e" : "#ef4444" }}>
                    {stats.gain >= 0 ? "+" : ""}{fmt$(stats.gain)} ({stats.gainPct}%)
                  </div>
                </div>

                <div style={{ marginTop: "auto" }}>
                  <div style={{ fontSize: 10, color: "#555", marginBottom: 8 }}>Risk Scale</div>
                  {[
                    { label: "0.9 – 1.0", color: "#dc2626" },
                    { label: "0.7 – 0.9", color: "#ea580c" },
                    { label: "0.5 – 0.7", color: "#ca8a04" },
                    { label: "0.3 – 0.5", color: "#16a34a" },
                    { label: "0.1 – 0.3", color: "#15803d" },
                    { label: "0.0 – 0.1", color: "#166534" },
                  ].map(r => (
                    <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, marginBottom: 3 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: r.color, flexShrink: 0 }} />
                      <span style={{ color: "#666" }}>{r.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Trade History Table */}
        {tradeLog && tradeLog.length > 0 && (
          <div style={{ borderTop: "1px solid #1a1a3a", padding: "20px" }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 500, color: "#c0c0e0", fontFamily: "'Space Grotesk', sans-serif" }}>
              Simulated Trade History
            </h3>
            <p style={{ margin: "0 0 14px", fontSize: 11, color: "#555" }}>
              {`Purchase $${baseAmount.toLocaleString()} multiplied by a factor based on ${asset.id} risk level, every ${frequency.toLowerCase()} on the ${dayOfMonth} — from ${startDate} to ${endDate}`}
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "'DM Mono', monospace" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1a1a3a" }}>
                    {["Date","Action","Risk","Asset Price","Accumulated","Invested Amount","Portfolio Value"].map(h => (
                      <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: "#555", fontWeight: 400, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tradeLog.map((row, i) => {
                    const isBuy = row.action !== "None";
                    const riskColor = row.risk > 0.6 ? "#ef4444" : row.risk > 0.4 ? "#ca8a04" : row.risk > 0.2 ? "#22c55e" : "#15803d";
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid #0f0f25", background: i % 2 === 0 ? "transparent" : "#0a0a1a" }}>
                        <td style={{ padding: "5px 10px", color: "#888", whiteSpace: "nowrap" }}>{row.date}</td>
                        <td style={{ padding: "5px 10px", color: isBuy ? "#6C8EFF" : "#555", fontWeight: isBuy ? 500 : 400 }}>{row.action}</td>
                        <td style={{ padding: "5px 10px" }}>
                          <span style={{ color: riskColor, background: riskColor + "22", padding: "1px 6px", borderRadius: 3 }}>{row.risk?.toFixed(3)}</span>
                        </td>
                        <td style={{ padding: "5px 10px", color: "#c0c0e0" }}>{fmt$(row.price)}</td>
                        <td style={{ padding: "5px 10px", color: "#c0c0e0" }}>{row.accumulated?.toFixed(4)} {asset.id}</td>
                        <td style={{ padding: "5px 10px", color: "#888" }}>{fmt$(row.invested ?? 0)}</td>
                        <td style={{ padding: "5px 10px", color: isBuy ? "#22c55e" : "#888", fontWeight: isBuy ? 500 : 400 }}>{fmt$(row.portfolioValue ?? 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}


      </div>

      <p style={{ fontSize: 10, color: "#2a2a4a", marginTop: 12, textAlign: "center" }}>
        {`${asset.type === "crypto" ? "Data: Binance API" : "Data: Yahoo Finance (via corsproxy.io)"} · Risk: 500-day geometric MA model · Not financial advice`}
      </p>
    </div>
  );
}
