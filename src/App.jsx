import React, { useState, useMemo, useEffect } from "react";
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

function fmt$(v, sym="$") {
  if (v == null || isNaN(v)) return sym + "0.00";
  if (v >= 1e6) return sym + (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return sym + Math.round(v).toLocaleString();
  return sym + v.toFixed(2);
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
const KNOWN_NAMES = {
    BTC: "Bitcoin", ETH: "Ethereum", SOL: "Solana",
    TSLA: "Tesla", NVDA: "Nvidia", MSTR: "MicroStrategy", AMD: "Advanced Micro Devices",
    AMZN: "Amazon", AVGO: "Broadcom", BMNR: "Bitmine Immersion Technologies",
    "BRK-B": "Berkshire Hathaway", CDNS: "Cadence Design Systems", CEG: "Constellation Energy",
    COIN: "Coinbase", CRWD: "CrowdStrike", DDOG: "Datadog", GOOG: "Alphabet (Google)",
    HOOD: "Robinhood", IREN: "Iris Energy", META: "Meta Platforms", MSFT: "Microsoft",
    MU: "Micron Technology", NFLX: "Netflix", OKLO: "Oklo", PLTR: "Palantir",
    QCOM: "Qualcomm", SMCI: "Super Micro Computer", ASST: "Asset Entities",
    TSM: "TSMC", TTD: "The Trade Desk", VRT: "Vertiv",
    GDX: "VanEck Gold Miners ETF", GLD: "SPDR Gold Shares",
    IBIT: "iShares Bitcoin Trust", MAGS: "Roundhill Magnificent Seven ETF",
    QQQ: "Invesco QQQ (Nasdaq 100)", SCHD: "Schwab US Dividend Equity ETF",
    SLV: "iShares Silver Trust", SMH: "VanEck Semiconductor ETF",
    SPY: "SPDR S&P 500 ETF", USO: "United States Oil Fund", VOO: "Vanguard S&P 500 ETF",
    XLK: "Technology Select Sector SPDR",
  };
export default function DCASimulator() {
  const [tab, setTab] = useState("dynamic");

  const MASTER_DEFAULTS = {
    assetId: "SPY", customTicker: null, frequency: "Monthly", startDate: "2022-02-02",
    riskBandIdx: 4, strategy: "Linear", riskOffset: -0.05,
    sellEnabled: false, sell90: true, initEnabled: false,
    initShares: "", initAvgPrice: "", initDate: "2022-01-01",
    leapEnabled: false, ccEnabled: false,
    ccPremiumPct: 0.40, leap09: true, leapCostPct: 0.40, leapDelta: 0.75,
    baseAmount: 1000, dayOfMonth: 13,
  };
  const USER_DEFAULTS_KEY = "reversion_alpha_user_defaults_v1";
  const loadUserDefaults = () => {
    try { const s = localStorage.getItem(USER_DEFAULTS_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
  };
  const getInitial = (key, fallback) => {
    const ud = loadUserDefaults();
    return ud && ud[key] !== undefined ? ud[key] : fallback;
  };
  const [showDefaultsMenu, setShowDefaultsMenu] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [currency, setCurrency] = useState("USD");
  const [cadRate, setCadRate] = useState(1.36); // fallback USD→CAD rate
  const [baseAmount, setBaseAmount] = useState(() => getInitial("baseAmount", 1000));
  // ── Asset catalogue ───────────────────────────────────────────────────────
  const ASSETS = [
    // Crypto — Binance
    { id: "BTC",  label: "BTC (Bitcoin)", type: "binance", cgId: null, ticker: "BTCUSDT", csvUrl: null },
    { id: "ETH",  label: "ETH (Ethereum)", type: "binance", cgId: null, ticker: "ETHUSDT", csvUrl: null },
    { id: "SOL",  label: "SOL (Solana)",  type: "binance", cgId: null, ticker: "SOLUSDT", csvUrl: null },
    // Stocks — Yahoo Finance (alphabetical)
    { id: "AMD",   label: "AMD (Advanced Micro Devices)", type: "stock", cgId: null, ticker: "AMD"   },
    { id: "AMZN",  label: "AMZN (Amazon)",                type: "stock", cgId: null, ticker: "AMZN"  },
    { id: "ASST",  label: "ASST (Asset Entities)",         type: "stock", cgId: null, ticker: "ASST"  },
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
    { id: "SMCI",  label: "SMCI (Super Micro Computer)",  type: "stock", cgId: null, ticker: "SMCI"  },
    { id: "TSLA",  label: "TSLA (Tesla)",                 type: "stock", cgId: null, ticker: "TSLA"  },
    { id: "TSM",   label: "TSM (TSMC)",                   type: "stock", cgId: null, ticker: "TSM"   },
    { id: "TTD",   label: "TTD (The Trade Desk)",         type: "stock", cgId: null, ticker: "TTD"   },
    { id: "VRT",   label: "VRT (Vertiv)",                 type: "stock", cgId: null, ticker: "VRT"   },
    // ETFs — Yahoo Finance (alphabetical)
    { id: "GDX",   label: "GDX (Gold Miners ETF)",        type: "etf", cgId: null, ticker: "GDX"   },
    { id: "GLD",   label: "GLD (Gold ETF)",               type: "etf", cgId: null, ticker: "GLD"   },
    { id: "IBIT",  label: "IBIT (Bitcoin ETF)",           type: "etf", cgId: null, ticker: "IBIT"  },
    { id: "MAGS",  label: "MAGS (Magnificent 7 ETF)",     type: "etf", cgId: null, ticker: "MAGS"  },
    { id: "QQQ",   label: "QQQ (Nasdaq 100 ETF)",          type: "etf", cgId: null, ticker: "QQQ"   },
    { id: "SCHD",  label: "SCHD (Schwab Dividend ETF)",   type: "etf", cgId: null, ticker: "SCHD"  },
    { id: "SLV",   label: "SLV (Silver ETF)",              type: "etf", cgId: null, ticker: "SLV"   },
    { id: "SMH",   label: "SMH (Semiconductors ETF)",     type: "etf", cgId: null, ticker: "SMH"   },
    { id: "SPY",   label: "SPY (S&P 500 ETF)",            type: "etf", cgId: null, ticker: "SPY"   },
    { id: "USO",   label: "USO (US Oil ETF)",              type: "etf", cgId: null, ticker: "USO"   },
    { id: "VOO",   label: "VOO (S&P 500 ETF)",            type: "etf", cgId: null, ticker: "VOO"   },
    { id: "XLK",   label: "XLK (Tech Sector ETF)",        type: "etf", cgId: null, ticker: "XLK"   },
  ];

  const [assetId, setAssetId] = useState(() => getInitial("assetId", "SPY"));
  const asset = ASSETS.find(a => a.id === assetId) ?? ASSETS[0];
  const [tickerInput, setTickerInput] = useState(() => getInitial("customTicker", null) || getInitial("assetId", "SPY"));
  const [customTicker, setCustomTicker] = useState(() => getInitial("customTicker", null)); // null = use dropdown ASSETS
  const [companyName, setCompanyName] = useState("SPDR S&P 500 ETF");

  const [frequency, setFrequency] = useState(() => getInitial("frequency", "Monthly"));
  const [dayOfMonth, setDayOfMonth] = useState(() => getInitial("dayOfMonth", 13));
  const [startDate, setStartDate] = useState(() => getInitial("startDate", "2022-02-02"));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [riskBandIdx, setRiskBandIdx] = useState(() => getInitial("riskBandIdx", 4));
  const [strategy, setStrategy] = useState(() => getInitial("strategy", "Linear"));
  const [scaleY, setScaleY] = useState("Lin");
  const [riskOffset, setRiskOffset] = useState(() => getInitial("riskOffset", -0.05));
  const [sellEnabled, setSellEnabled] = useState(() => getInitial("sellEnabled", false));
  const [initEnabled, setInitEnabled] = useState(() => getInitial("initEnabled", false));
  const [initDate, setInitDate] = useState(() => getInitial("initDate", "2022-01-01"));
  const [initShares, setInitShares] = useState(() => getInitial("initShares", ""));
  const [initAvgPrice, setInitAvgPrice] = useState(() => getInitial("initAvgPrice", ""));
  const [sell90, setSell90] = useState(() => getInitial("sell90", true));
  const [leapEnabled, setLeapEnabled] = useState(() => getInitial("leapEnabled", false));
  const [ccEnabled, setCcEnabled] = useState(() => getInitial("ccEnabled", false));
  const [ccPremiumPct, setCcPremiumPct] = useState(() => getInitial("ccPremiumPct", 0.40)); // 0.40% of share value per month
  const [leap09, setLeap09] = useState(() => getInitial("leap09", true));   // 0.0 – 0.099 risk zone
  const [leapCostPct, setLeapCostPct] = useState(() => getInitial("leapCostPct", 0.40));  // LEAP costs 40% of stock price
  const [leapDelta, setLeapDelta] = useState(() => getInitial("leapDelta", 0.75));       // 0.75 delta

  const [dailyData, setDailyData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // ── Portfolio Tracker ─────────────────────────────────────────────────────
  const PORTFOLIO_KEY = "reversion_alpha_portfolio_v1";
  const PLANNED_KEY = "reversion_alpha_planned_v1";
  const [portfolio, setPortfolio] = useState(() => {
    try { const s = localStorage.getItem(PORTFOLIO_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [planned, setPlanned] = useState(() => {
    try { const s = localStorage.getItem(PLANNED_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [showCagr, setShowCagr] = useState(false);
  const [portfolioPrices, setPortfolioPrices] = useState({});
  const [portfolioLoading, setPortfolioLoading] = useState({});

  // Save portfolio to localStorage whenever it changes
  useEffect(() => {
    try { localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(portfolio)); } catch {}
  }, [portfolio]);
  useEffect(() => {
    try { localStorage.setItem(PLANNED_KEY, JSON.stringify(planned)); } catch {}
  }, [planned]);

  // Fetch live price for a single portfolio ticker
  // Fetch all portfolio prices when switching to portfolio tab
  useEffect(() => {
    if (tab === "portfolio") {
      portfolio.forEach(h => { if (h.ticker) fetchPortfolioPrice(h.ticker); });
      planned.forEach(h => { if (h.ticker) fetchPortfolioPrice(h.ticker); });
    }
  }, [tab]);

  function addHolding() {
    setPortfolio(p => [...p, { id: Date.now(), ticker: "", shares: "", entryPrice: "" }]);
  }

  function removeHolding(id) {
    setPortfolio(p => p.filter(h => h.id !== id));
  }

  function updateHolding(id, field, value) {
    setPortfolio(p => p.map(h => h.id === id ? { ...h, [field]: value } : h));
  }

  // Store computed risk and CAGR per portfolio ticker
  const [portfolioRisk, setPortfolioRisk] = useState({});
  const [portfolioCagr, setPortfolioCagr] = useState({});

  function computeCagrFromPrices(prices, timestamps) {
    // prices: array of closing prices, timestamps: array of ms timestamps
    if (!prices || prices.length < 2) return null;
    const now = prices[prices.length - 1];
    const nowTs = timestamps[timestamps.length - 1];

    function cagrOver(years) {
      const targetTs = nowTs - years * 365.25 * 86400 * 1000;
      // Find closest price to target date
      let idx = 0;
      for (let i = 0; i < timestamps.length; i++) {
        if (timestamps[i] >= targetTs) { idx = i; break; }
      }
      const past = prices[idx];
      if (!past || past <= 0) return null;
      const actualYears = (nowTs - timestamps[idx]) / (365.25 * 86400 * 1000);
      if (actualYears < 0.5) return null;
      return (Math.pow(now / past, 1 / actualYears) - 1) * 100;
    }

    const cagr1  = cagrOver(1);
    const cagr3  = cagrOver(3);
    const cagr5  = cagrOver(5);
    const cagr10 = cagrOver(10);

    // Forward estimates — mean reversion model
    // 5yr forward = average of available historical CAGRs, capped at reasonable range
    const historical = [cagr1, cagr3, cagr5, cagr10].filter(v => v != null);
    const fwd5 = historical.length > 0
      ? Math.min(35, Math.max(-5, historical.reduce((a, b) => a + b, 0) / historical.length * 0.75))
      : null;
    // Each decade decays by ~15% of the estimate (reversion to long-run mean ~7%)
    const LONG_RUN = 7;
    const fwd10 = fwd5 != null ? fwd5 + (LONG_RUN - fwd5) * 0.20 : null;
    const fwd20 = fwd5 != null ? fwd5 + (LONG_RUN - fwd5) * 0.45 : null;
    const fwd30 = fwd5 != null ? fwd5 + (LONG_RUN - fwd5) * 0.65 : null;

    return { cagr1, cagr3, cagr5, cagr10, fwd5, fwd10, fwd20, fwd30 };
  }

  async function fetchPortfolioPrice(ticker) {
    if (!ticker) return;
    const upper = ticker.toUpperCase();
    setPortfolioLoading(p => ({ ...p, [upper]: true }));
    // Try Binance first for crypto
    try {
      const binanceRes = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${upper}USDT`);
      if (binanceRes.ok) {
        const binanceJson = await binanceRes.json();
        if (binanceJson.price) {
          setPortfolioPrices(p => ({ ...p, [upper]: parseFloat(binanceJson.price) }));
          fetchPortfolioRisk(upper, "binance");
          setPortfolioLoading(p => ({ ...p, [upper]: false }));
          return;
        }
      }
    } catch {}
    // Yahoo Finance via proxy
    try {
      const res = await fetch(`/api/yahoo/${upper}?_=${Date.now()}`);
      if (res.ok) {
        const json = await res.json();
        const result = json.chart?.result?.[0];
        const price = result?.meta?.regularMarketPrice;
        if (price) setPortfolioPrices(p => ({ ...p, [upper]: price }));
        if (result?.timestamp && result?.indicators) {
          const closes = result.indicators.adjclose?.[0]?.adjclose ?? result.indicators.quote?.[0]?.close ?? [];
          const timestamps = result.timestamp.map(t => t * 1000);
          const prices = closes.map((p, i) => ({ p, t: timestamps[i] })).filter(x => x.p != null && x.p > 0);
          const cleanPrices = prices.map(x => x.p);
          const cleanTs = prices.map(x => x.t);
          if (cleanPrices.length >= 100) {
            const risk = computeRiskFromPrices(cleanPrices, false);
            setPortfolioRisk(r => ({ ...r, [upper]: risk }));
            const cagr = computeCagrFromPrices(cleanPrices, cleanTs);
            if (cagr) setPortfolioCagr(c => ({ ...c, [upper]: cagr }));
          }
        }
      }
    } catch {}
    setPortfolioLoading(p => ({ ...p, [upper]: false }));
  }

  async function fetchPortfolioRisk(ticker, type) {
    const upper = ticker.toUpperCase();
    if (type === "binance") {
      try {
        const url = `https://api.binance.com/api/v3/klines?symbol=${upper}USDT&interval=1d&limit=1000`;
        const res = await fetch(url);
        if (res.ok) {
          const candles = await res.json();
          const prices = candles.map(c => parseFloat(c[4])).filter(p => p > 0);
          const timestamps = candles.map(c => c[0]);
          if (prices.length >= 100) {
            const risk = computeRiskFromPrices(prices, true);
            setPortfolioRisk(r => ({ ...r, [upper]: risk }));
            const cagr = computeCagrFromPrices(prices, timestamps);
            if (cagr) setPortfolioCagr(c => ({ ...c, [upper]: cagr }));
          }
        }
      } catch {}
    }
  }

  function computeRiskFromPrices(prices, isCrypto = false) {
    // Exact same 500-day geometric MA + calcRisk formula as the simulator
    const WINDOW = 500;
    let logSum = 0;
    let risk = 0.5;
    prices.forEach((price, i) => {
      logSum += Math.log10(Math.max(price, 1));
      if (i >= WINDOW) logSum -= Math.log10(Math.max(prices[i - WINDOW], 1));
      const ma = Math.pow(10, logSum / Math.min(i + 1, WINDOW));
      const logRatio = Math.log10(price / ma);
      risk = Math.min(1, Math.max(0, (logRatio + 0.4647) / 1.0013));
    });
    // Apply same default offset as simulator: crypto -0.02, stocks -0.05
    const offset = isCrypto ? -0.02 : -0.05;
    return Math.min(1, Math.max(0, risk + offset));
  }

  function getPortfolioAction(ticker) {
    const upper = ticker?.toUpperCase();
    if (!upper) return { label: "—", color: "#888" };
    const risk = portfolioRisk[upper] ?? null;
    if (risk === null) return { label: "Loading...", color: T.textDim };
    if (risk >= 0.90) return { label: "Sell 10%", color: "#f59e0b" };
    if (risk >= riskBand.max) return { label: "Hold", color: "#94a3b8" };
    const mult = getMultiplier(risk, riskBand, strategy);
    if (mult === 0) return { label: "Hold", color: "#94a3b8" };
    return { label: `Buy ${mult}x`, color: "#22c55e" };
  }

  // Fetch live USD→CAD rate once on mount
  useEffect(() => {
    fetch("https://api.frankfurter.app/latest?from=USD&to=CAD")
      .then(r => r.json())
      .then(j => { if (j.rates?.CAD) setCadRate(j.rates.CAD); })
      .catch(() => {}); // silently keep fallback rate
  }, []);

  useEffect(() => {
    async function fetchAssetData() {
      try {
        setLoading(true);
        setError(null);
        setDailyData([]);
        let raw = [];

        // Determine what to fetch
        const ticker = customTicker ?? asset.ticker ?? asset.id;
        const isBinanceAsset = !customTicker && asset.type === "binance";

        // For custom tickers: try Binance first, then Yahoo Finance
        if (customTicker) {
          // Try Binance (crypto) first
          try {
            const binanceUrl = `https://api.binance.com/api/v3/klines?symbol=${ticker.toUpperCase()}USDT&interval=1d&limit=1000`;
            const res = await fetch(binanceUrl);
            if (res.ok) {
              const candles = await res.json();
              if (Array.isArray(candles) && candles.length > 10) {
                raw = candles.map(c => ({ ts: c[0], date: new Date(c[0]), price: parseFloat(c[4]) }))
                  .filter(d => d.price > 0);
                // Fetch more history if needed
                if (candles.length === 1000) {
                  let endTime = candles[0][0] - 1;
                  let safety = 8;
                  while (safety-- > 0) {
                    const r2 = await fetch(`https://api.binance.com/api/v3/klines?symbol=${ticker.toUpperCase()}USDT&interval=1d&limit=1000&endTime=${endTime}`);
                    if (!r2.ok) break;
                    const more = await r2.json();
                    if (!more.length) break;
                    const older = more.map(c => ({ ts: c[0], date: new Date(c[0]), price: parseFloat(c[4]) })).filter(d => d.price > 0);
                    raw = [...older, ...raw];
                    endTime = more[0][0] - 1;
                    if (more.length < 1000) break;
                  }
                }
                raw.sort((a, b) => a.ts - b.ts);
              }
            }
          } catch(e) { /* fall through to Yahoo */ }

          // If Binance didn't work, try Yahoo Finance
          if (raw.length === 0) {
            const res = await fetch(`/api/yahoo/${ticker.toUpperCase()}?_=${Date.now()}`);
            if (!res.ok) throw new Error(`Could not find data for "${ticker.toUpperCase()}" — check the ticker and try again`);
            const contentType = res.headers.get("content-type") ?? "";
            if (!contentType.includes("json")) throw new Error("Proxy returned non-JSON — check vercel.json is deployed");
            const json = await res.json();
            const result = json.chart?.result?.[0];
            if (!result) throw new Error(`No data found for "${ticker.toUpperCase()}"`);
            const timestamps = result.timestamp;
            const closes = result.indicators.adjclose?.[0]?.adjclose ?? result.indicators.quote?.[0]?.close;
            if (!timestamps || !closes) throw new Error("Unexpected data format");
            raw = timestamps.map((ts, i) => ({ ts: ts * 1000, date: new Date(ts * 1000), price: closes[i] }))
              .filter(d => d.price != null && d.price > 0 && isFinite(d.price));

            // Always update last bar with live price directly on raw
            const livePriceCustom = result.meta?.regularMarketPrice;
            if (livePriceCustom && isFinite(livePriceCustom) && livePriceCustom > 0) {
              raw[raw.length - 1] = { ...raw[raw.length - 1], price: livePriceCustom };
            }
          }

          if (raw.length === 0) throw new Error(`No price data found for "${ticker.toUpperCase()}"`);

        } else if (isBinanceAsset || asset.type === "binance") {
          // Binance public API — CORS-friendly, no key needed, full daily history
          // BTC and ETH both have data from 2017 on Binance
          const startTime = ["BTC","ETH"].includes(asset.id)
            ? new Date("2017-07-01").getTime()
            : new Date("2020-01-01").getTime();
          let batches = [];
          let endTime = Date.now();
          let safetyLimit = 10; // max 10 requests = 10,000 days ≈ 27 years
          while (endTime > startTime && safetyLimit-- > 0) {
            const url = `https://api.binance.com/api/v3/klines?symbol=${asset.ticker}&interval=1d&limit=1000&endTime=${endTime}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Binance HTTP ${res.status}`);
            const candles = await res.json();
            if (!Array.isArray(candles) || candles.length === 0) break;
            batches.unshift(candles); // prepend batch
            endTime = candles[0][0] - 1; // step back before oldest
            if (candles.length < 1000) break; // reached the beginning
          }
          const allCandles = batches.flat();
          // Deduplicate by timestamp
          const seen = new Set();
          raw = allCandles
            .filter(c => { if (seen.has(c[0])) return false; seen.add(c[0]); return true; })
            .map(c => ({ ts: c[0], date: new Date(c[0]), price: parseFloat(c[4]) }))
            .filter(d => d.price > 0 && isFinite(d.price) && d.ts >= startTime)
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
          const res = await fetch(`/api/yahoo/${asset.ticker}?_=${Date.now()}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const contentType = res.headers.get("content-type") ?? "";
          if (!contentType.includes("json")) throw new Error("Proxy returned non-JSON — check vercel.json is deployed");
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

          // Always update last bar with live price directly on raw
          const livePrice = result.meta?.regularMarketPrice;
          if (livePrice && isFinite(livePrice) && livePrice > 0) {
            raw[raw.length - 1] = { ...raw[raw.length - 1], price: livePrice };
          }
        }

        const parsed = addMovingAverage(raw);
        setDailyData(parsed);
        setLastUpdated(new Date());
        // Set company name from lookup or Yahoo metadata
        const t = customTicker ?? asset.id;
        if (KNOWN_NAMES[t]) {
          setCompanyName(KNOWN_NAMES[t]);
        } else {
          // Try to get name from Yahoo quote endpoint
          try {
            const qRes = await fetch(`/api/yahoo/${t}?_=${Date.now()}`);
            if (qRes.ok) {
              const qJson = await qRes.json();
              const name = qJson.chart?.result?.[0]?.meta?.longName
                        ?? qJson.chart?.result?.[0]?.meta?.shortName
                        ?? t;
              setCompanyName(name);
            }
          } catch(e) { setCompanyName(t); }
        }
      } catch (e) {
        console.error("Fetch failed:", e);
        const hint = (asset.type === "stock" || asset.type === "etf")
          ? " Make sure vercel.json is in your project root."
          : " Try refreshing.";
        setError(`Live data unavailable for ${displayTicker} — ${e.message}.${hint}`);
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
  }, [assetId, customTicker]);

  // When switching assets, only clamp startDate if it's before the available data
  useEffect(() => {
    if (dailyData.length === 0) return;
    const earliest = dailyData[0].date.toISOString().slice(0, 10);
    if (startDate < earliest) setStartDate(earliest);
  }, [assetId, customTicker, dailyData]);

  // Auto-adjust risk defaults + reset sell/init on asset change
  useEffect(() => {
    const isCrypto = customTicker
      ? false
      : (asset.type === "binance" || asset.type === "crypto");
    if (isCrypto) {
      setRiskBandIdx(4);
      setRiskOffset(-0.02);
    } else {
      setRiskBandIdx(4);
      setRiskOffset(-0.05);
    }
    // Reset sell strategy, initial position and LEAP
    setSellEnabled(false);
    setInitEnabled(false);
    setInitShares("");
    setInitAvgPrice("");
    setLeapEnabled(false);
    setCcEnabled(false);
  }, [assetId, customTicker]);

  // When switching to lump sum, extend end date to today so full growth is shown
  useEffect(() => {
    if (tab === "lump") {
      setEndDate(new Date().toISOString().slice(0, 10));
    }
  }, [tab]);

  const riskBand = RISK_BANDS[riskBandIdx];
  const displayTicker = customTicker ?? asset.id;
  const displayLabel = customTicker ?? asset.label;
  const minDate = dailyData[0]?.date.toISOString().slice(0, 10) ?? "2012-01-01";
  const maxDate = dailyData[dailyData.length - 1]?.date.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10);

  // Apply offset to all risk values in rangeData
  const rangeData = useMemo(() => {
    const s = new Date(startDate).getTime();
    const e = new Date(endDate + "T23:59:59").getTime();
    return dailyData
      .filter(d => d.ts >= s && d.ts <= e)
      .map(d => ({ ...d, risk: parseFloat(Math.min(1, Math.max(0, d.risk + riskOffset)).toFixed(4)) }));
  }, [dailyData, startDate, endDate, riskOffset]);

  // isPurchaseDay: returns true on the scheduled day OR the next available
  // trading day if the target falls on a weekend/holiday.
  // Uses a simple external tracker object to ensure exactly ONE fire per period.
  function buildPurchaseDaySet(data, freq, dom) {
    const fired = new Set();
    data.forEach((d, i) => {
      const date = d.date;
      if (freq === "Daily") { fired.add(i); return; }
      if (freq === "Weekly") { if (date.getDay() === 1) fired.add(i); return; }
      if (freq === "Monthly") {
        const key = `${date.getFullYear()}-${date.getMonth()}`;
        if (!fired.has(key) && date.getDate() >= dom) {
          fired.add(key);
          fired.add(i); // mark this index as the purchase day
        }
      }
    });
    return fired;
  }

  // Build exponential tiers: 1x, 2x, 4x, 8x, 16x...
  // e.g. band 0.4–0.5 → [0.4,0.5]=1x [0.3,0.4]=2x [0.2,0.3]=4x [0.1,0.2]=8x [0,0.1]=16x
  function buildExpTiers(band) {
    const tiers = [];
    const step = 0.1;
    let top = parseFloat(band.max.toFixed(3));
    let bot = parseFloat(band.min.toFixed(3));
    let mult = 1;
    tiers.push({ y1: bot, y2: top, mult });
    while (bot > 0.001) {
      const newBot = parseFloat(Math.max(0, bot - step).toFixed(3));
      mult *= 2;
      tiers.push({ y1: newBot, y2: bot, mult });
      bot = newBot;
    }
    return tiers;
  }

  // Build linear tiers: 1x, 2x, 3x, 4x, 5x...
  // Same tier boundaries as exponential but multiplier increments by 1 each step down
  function buildLinearTiers(band) {
    const tiers = [];
    const step = 0.1;
    let top = parseFloat(band.max.toFixed(3));
    let bot = parseFloat(band.min.toFixed(3));
    let mult = 1;
    tiers.push({ y1: bot, y2: top, mult });
    while (bot > 0.001) {
      const newBot = parseFloat(Math.max(0, bot - step).toFixed(3));
      mult += 1;
      tiers.push({ y1: newBot, y2: bot, mult });
      bot = newBot;
    }
    return tiers;
  }

  const expTiers = buildExpTiers(riskBand);
  const linearTiers = buildLinearTiers(riskBand);

  function getMultiplier(risk, band, strat) {
    if (risk >= band.max) return 0; // above band = no buy for both modes
    if (strat === "Linear") {
      for (const tier of linearTiers) {
        if (risk >= tier.y1 && risk < tier.y2) return tier.mult;
      }
      return 0;
    }
    // Exponential
    for (const tier of expTiers) {
      if (risk >= tier.y1 && risk < tier.y2) return tier.mult;
    }
    return 0;
  }

  const simulation = useMemo(() => {
    if (!rangeData.length) return { chartData: [], riskData: [], tradeLog: [], stats: null };

    // Initial position values — added to totals only when initDate is reached in loop
    const initSh = parseFloat(initShares) || 0;
    const initPx = parseFloat(initAvgPrice) || 0;
    const initCost = initSh * initPx;
    let totalInvested = 0;
    let totalAsset = 0;
    let totalAssetNoSell = 0;
    let buyCount = 0, sellCount = 0, totalSellProceeds = 0, totalSellAsset = 0, totalSellCostBasis = 0;
    let leapCount = 0, totalLeapInvested = 0;
    let leapRealizedPnl = 0; // P&L from expired/closed LEAP positions
    let leapClosedCount = 0;
    let ccCount = 0, totalCcIncome = 0;
    const leapPositions = []; // open positions: { entryPrice, notionalShares, cost, delta, entryTs, termMonths, expiryTs }
    const leapClosed = [];    // closed positions with realized P&L
    const tradeLog = [];
    const chartData = [];
    const riskData = [];

    // Initial position injection setup
    // If initDate is before simulation start, we still show it first in the log
    const initTs = initEnabled && initSh > 0 && initPx > 0
      ? new Date(initDate).getTime() : null;
    let initInjected = false;
    // If purchase was before our data range, inject immediately as first entry
    if (initTs && rangeData.length > 0 && initTs < rangeData[0].ts) {
      initInjected = true;
      // Add to totals immediately since purchase is before simulation range
      totalAsset += initSh;
      totalAssetNoSell += initSh;
      totalInvested += initCost;
      tradeLog.push({
        date: new Date(initDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        action: "Initial Position",
        risk: null,
        price: initPx,
        purchaseAmt: initCost,
        accumulated: initSh,
        invested: initCost,
        portfolioValue: initSh * rangeData[0].price,
        isInitial: true,
      });
    }
    const lumpPrice = rangeData[0]?.price ?? 1;
    const lumpEquiv = tab === "lump" ? baseAmount : baseAmount * Math.max(rangeData.length / 30, 1);
    const lumpAsset = lumpEquiv / lumpPrice;

    // Build the set of scheduled day indices ONCE — exactly one per period
    const scheduledDays = buildPurchaseDaySet(rangeData, frequency, dayOfMonth);
    const totalPeriods = [...scheduledDays].filter(v => typeof v === "number").length;

    for (let i = 0; i < rangeData.length; i++) {
      const d = rangeData[i];
      let purchase = 0;
      const isLastDay = i === rangeData.length - 1;
      const isBuyDay = scheduledDays.has(i);

      // Inject initial position at the correct point in time
      if (initTs && !initInjected && d.ts >= initTs) {
        initInjected = true;
        // NOW add the shares and cost to running totals
        totalAsset += initSh;
        totalAssetNoSell += initSh;
        totalInvested += initCost;
        tradeLog.push({
          date: new Date(initDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          action: "Initial Position",
          risk: d.risk,
          price: initPx,
          purchaseAmt: initCost,
          accumulated: totalAsset,
          invested: totalInvested,
          portfolioValue: totalAsset * d.price,
          isInitial: true,
        });
      }

      if (tab === "equal") {
        if (isBuyDay && !isLastDay) { purchase = baseAmount; buyCount++; }
      } else if (tab === "lump") {
        if (i === 0) { purchase = lumpEquiv; buyCount++; }
      } else {
        if (isBuyDay && !isLastDay) {
          const mult = getMultiplier(d.risk, riskBand, strategy);
          if (mult > 0) { purchase = baseAmount * mult; buyCount++; }
        }
      }

      // isBuyDay already set above from scheduledDays

      // Close expired LEAP positions at today's price
      for (let li = leapPositions.length - 1; li >= 0; li--) {
        const lp = leapPositions[li];
        if (d.ts >= lp.expiryTs) {
          const strike = lp.entryPrice * 0.92;
          const intrinsicAtExpiry = Math.max(0, d.price - strike) * lp.notionalShares;
          const pnl = intrinsicAtExpiry - lp.cost; // net P&L after cost
          leapRealizedPnl += pnl;
          leapClosedCount++;
          leapClosed.push({ ...lp, expiryPrice: d.price, intrinsicAtExpiry, pnl });
          leapPositions.splice(li, 1); // remove from open positions
          // Add expiry event to trade log
          tradeLog.push({
            date: d.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
            action: pnl >= 0 ? "LEAP Expired ✓" : "LEAP Expired ✗",
            risk: d.risk,
            price: d.price,
            purchaseAmt: null,
            sellProceeds: intrinsicAtExpiry > 0 ? intrinsicAtExpiry : null,
            ccIncome: null,
            isLeap: false,
            leapExpiry: true,
            leapPnl: pnl,
            leapContracts: lp.contracts ?? null,
          });
        }
      }

      // LEAP logic — replaces regular buy at risk zones 0-0.099 and 0.1-0.199
      let isLeapDay = false;
      let leapCost = 0;
      let leapNotional = 0;
      if (leapEnabled && isBuyDay && !isLastDay && purchase > 0) {
        const inLeap09Zone = leap09 && d.risk < 0.10;
        if (inLeap09Zone) {
          // Real contract math: 1 contract = 100 shares, cost = premium/share × 100
          const premiumPerShare = d.price * leapCostPct;
          const costPerContract = premiumPerShare * 100;
          const contracts = Math.floor(purchase / costPerContract);

          if (contracts === 0) {
            // Can't afford even 1 contract — buy shares instead (no LEAP this period)
            // purchase stays as-is, isLeapDay stays false
          } else {
            isLeapDay = true;
            leapCost = contracts * costPerContract; // actual spend (may be less than purchase)
            leapNotional = contracts * 100;          // always a multiple of 100
            const leftover = purchase - leapCost;    // unspent cash — buy shares with remainder
            const termMonths = 18;
            const expiryTs = d.ts + termMonths * 30.44 * 24 * 60 * 60 * 1000;
            leapPositions.push({ entryPrice: d.price, notionalShares: leapNotional, contracts, cost: leapCost, delta: leapDelta, entryTs: d.ts, termMonths, expiryTs });
            totalLeapInvested += leapCost;
            totalInvested += leapCost;
            leapCount++;
            // Buy shares with any leftover (e.g. $2500 budget, $1800 spent on 1 contract → $700 buys shares)
            if (leftover > 0) {
              totalAsset += leftover / d.price;
              totalAssetNoSell += leftover / d.price;
              totalInvested += leftover;
              buyCount++;
            }
            purchase = 0; // handled above
          }
        }
      }

      // Sell logic — only triggers on scheduled days, same as buys
      let sellPct = 0;
      let sellProceeds = 0;
      if (sellEnabled && isBuyDay && totalAsset > 0 && !isLastDay) {
        if (sell90 && d.risk >= 0.90) sellPct = 0.10;
        if (sellPct > 0) {
          const assetSold = totalAsset * sellPct;
          sellProceeds = assetSold * d.price;
          // Cost basis of sold shares = units sold × average cost per unit
          const avgCostPerUnit = totalAsset > 0 ? totalInvested / totalAsset : 0;
          totalSellCostBasis += assetSold * avgCostPerUnit;
          totalAsset -= assetSold;
          totalSellProceeds += sellProceeds;
          totalSellAsset += assetSold;
          sellCount++;
        }
      }

      const isSellDay = sellPct > 0;

      // Covered call — only triggers on scheduled buy days, same as everything else
      let ccIncome = 0;
      let ccShares = 0;
      let ccContracts = 0;
      if (ccEnabled && isBuyDay && d.risk >= 0.90 && totalAsset > 0 && !isLastDay) {
        // Simulator: use half the position in fractional shares, display as equivalent contracts
        ccShares = totalAsset / 2;
        ccContracts = Math.floor(ccShares / 100); // display only — how many real contracts this represents
        if (ccShares > 0) {
          ccIncome = ccShares * d.price * (ccPremiumPct / 100);
          totalCcIncome += ccIncome;
          ccCount++;
        }
      }
      const isCcDay = ccIncome > 0;

      if (isBuyDay || isSellDay || isLastDay || isCcDay) {
        const mult = tab === "dynamic" && !isLastDay ? getMultiplier(d.risk, riskBand, strategy) : 0;
        let action = "None";
        if (isSellDay) {
          action = `Sell ${(sellPct * 100).toFixed(0)}%`;
        } else if (isCcDay) {
          action = `Covered Call`;
        } else if (isLeapDay) {
          action = `LEAP 0.${Math.round(leapDelta*100)}Δ`;
        } else if (!isLastDay && purchase > 0) {
          if (tab === "equal") action = "Buy 1x";
          else if (tab === "lump") action = "Lump Sum";
          else if (strategy === "Linear") action = `Buy ${mult}x`;
          else action = `Buy ${mult}x`;
        }
        tradeLog.push({
          date: d.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          action,
          risk: d.risk,
          price: d.price,
          purchaseAmt: isLeapDay ? leapCost : purchase,
          sellProceeds: sellProceeds > 0 ? sellProceeds : null,
          ccIncome: null,
          ccShares: null,
          ccContracts: null,
          isLeap: isLeapDay,
          leapNotional: isLeapDay ? leapNotional : null,
          leapContracts: isLeapDay ? (leapPositions[leapPositions.length - 1]?.contracts ?? null) : null,
        });
        // If BOTH sell and CC happen on same day, push a second row for the CC
        if (isSellDay && isCcDay) {
          tradeLog.push({
            date: d.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
            action: `Covered Call`,
            risk: d.risk,
            price: d.price,
            purchaseAmt: null,
            sellProceeds: null,
            ccIncome: ccIncome,
            ccShares: ccShares,
            ccContracts: ccContracts,
            isLeap: false,
            leapNotional: null,
            leapContracts: null,
          });
        } else if (isCcDay) {
          // Single CC row — patch ccIncome onto the already-pushed entry
          const last = tradeLog[tradeLog.length - 1];
          last.ccIncome = ccIncome;
          last.ccShares = ccShares;
          last.ccContracts = ccContracts;
        }
      }

      if (purchase > 0 && !isSellDay) { totalInvested += purchase; totalAsset += purchase / d.price; }
      if (purchase > 0) totalAssetNoSell += purchase / d.price; // always accumulate for comparison

      // Update tradeLog entry with running totals (after purchase)
      if (tradeLog.length > 0 && (isBuyDay || isLastDay || isCcDay)) {
        const last = tradeLog[tradeLog.length - 1];
        last.accumulated = totalAsset;
        last.invested = totalInvested;
        last.portfolioValue = totalAsset * d.price;
      }

      // Portfolio chart: sample every 3 days (performance)
      if (i % 3 === 0 || isLastDay) {
        // Current LEAP value: open positions only (expired ones already booked as realized P&L)
        const leapPortVal = leapPositions.reduce((sum, lp) => {
          const strike = lp.entryPrice * 0.92;
          const intrinsicAtEntry = Math.max(0, lp.entryPrice - strike) * lp.notionalShares;
          const extrinsicAtEntry = Math.max(0, lp.cost - intrinsicAtEntry);
          const monthsHeld = (d.ts - lp.entryTs) / (1000 * 60 * 60 * 24 * 30.44);
          const extrinsicLeft = extrinsicAtEntry * Math.max(0, 1 - monthsHeld / lp.termMonths);
          const intrinsicNow = Math.max(0, d.price - strike) * lp.notionalShares;
          return sum + intrinsicNow + extrinsicLeft;
        }, 0);
        // Add realized P&L from expired LEAPs (cash already received/lost)
        const totalLeapValue = leapPortVal + Math.max(0, leapRealizedPnl);
        chartData.push({
          ts: d.ts, label: fmtDate(d.date),
          price: Math.round(d.price),
          portfolio: (totalAsset > 0 || leapPositions.length > 0 || leapClosedCount > 0)
            ? Math.max(1, Math.round(totalAsset * d.price + totalLeapValue)) : null,
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
    const prevPrice = rangeData[rangeData.length - 2]?.price ?? lastPrice;
    const dailyChangePct = prevPrice > 0 ? ((lastPrice - prevPrice) / prevPrice * 100).toFixed(2) : 0;
    const currentPortfolio = totalAsset * lastPrice;
    const gain = currentPortfolio - totalInvested;
    const gainPct = totalInvested > 0 ? ((currentPortfolio / totalInvested - 1) * 100).toFixed(2) : 0;
    return {
      chartData,
      riskData,
      tradeLog,
      stats: {
        totalInvested, totalAsset, avgPrice: totalAsset > 0 ? totalInvested / totalAsset : 0,
        lastPrice, prevPrice, dailyChangePct, currentPortfolio, gain, gainPct,
        totalPeriods, totalMonths: Math.round(rangeData.length / 30), buyCount, sellCount, totalSellProceeds, totalSellAsset, totalSellCostBasis,
        leapCount, totalLeapInvested,
        ccCount, totalCcIncome,
        // Open positions: current mark-to-market value
        leapPortfolioValue: (() => {
          const lastPx = rangeData[rangeData.length - 1]?.price ?? 0;
          const lastTs = rangeData[rangeData.length - 1]?.ts ?? 0;
          const openVal = leapPositions.reduce((sum, lp) => {
            const strike = lp.entryPrice * 0.92;
            const intrinsicAtEntry = Math.max(0, lp.entryPrice - strike) * lp.notionalShares;
            const extrinsicAtEntry = Math.max(0, lp.cost - intrinsicAtEntry);
            const monthsHeld = (lastTs - lp.entryTs) / (1000 * 60 * 60 * 24 * 30.44);
            const extrinsicLeft = extrinsicAtEntry * Math.max(0, 1 - monthsHeld / lp.termMonths);
            const intrinsicNow = Math.max(0, lastPx - strike) * lp.notionalShares;
            return sum + intrinsicNow + extrinsicLeft;
          }, 0);
          // Add back net cash from expired positions (positive = profit, negative = loss)
          return openVal + leapRealizedPnl;
        })(),
        leapExpiryValue: (() => {
          // What open positions would be worth if expired today at last price
          const lastPx = rangeData[rangeData.length - 1]?.price ?? 0;
          return leapPositions.reduce((sum, lp) => {
            const strike = lp.entryPrice * 0.92;
            return sum + Math.max(0, lastPx - strike) * lp.notionalShares;
          }, 0);
        })(),
        leapRealizedPnl, leapClosedCount, openLeapCount: leapPositions.length,
        avgLeapEntry: leapCount > 0
          ? leapPositions.reduce((s, lp) => s + lp.entryPrice * lp.cost, 0) / totalLeapInvested
          : 0,
        sellPnl: (currentPortfolio + totalSellProceeds) - totalInvested,
        noSellPortfolio: totalAssetNoSell * lastPrice,
        sellPnlPct: totalInvested > 0 ? (((currentPortfolio + totalSellProceeds) / totalInvested - 1) * 100).toFixed(2) : 0,
      },
    };
  }, [rangeData, tab, baseAmount, frequency, dayOfMonth, riskBand, strategy, sellEnabled, sell90, initEnabled, initShares, initAvgPrice, initDate, leapEnabled, leap09, leapCostPct, leapDelta, ccEnabled, ccPremiumPct]);

  const { chartData, riskData, tradeLog, stats } = simulation;

  const T = darkMode ? {
    bg:        "#07071a",
    card:      "#0d0d1f",
    border:    "#1a1a3a",
    border2:   "#2a2a4a",
    inputBg:   "#1a1a2e",
    text:      "#e0e0ff",
    textMid:   "#888",
    textDim:   "#555",
    textFaint: "#333",
    accent:    "#6C8EFF",
    label:     "#666",
  } : {
    bg:        "#f0f2f8",
    card:      "#ffffff",
    border:    "#d0d4e8",
    border2:   "#c0c8e0",
    inputBg:   "#f8f9ff",
    text:      "#1a1a3a",
    textMid:   "#445",
    textDim:   "#667",
    textFaint: "#aaa",
    accent:    "#4a6ef5",
    label:     "#778",
  };

  // Currency helpers
  const currSym = currency === "CAD" ? "CA$" : "$";
  const toDisplay = (usdVal) => currency === "CAD" ? usdVal * cadRate : usdVal;
  const fmtC = (usdVal) => fmt$(toDisplay(usdVal), currSym);

  const inputStyle = {
    background: T.inputBg, border: `1px solid ${T.border2}`, borderRadius: 6,
    color: T.text, padding: "7px 10px", fontSize: 13, height: 36,
    fontFamily: "'DM Mono', monospace", outline: "none", boxSizing: "border-box",
  };
  const tabStyle = (t) => ({
    padding: "8px 18px", border: "none",
    borderBottom: tab === t ? `2px solid ${T.accent}` : "2px solid transparent",
    color: tab === t ? T.accent : T.textMid,
    cursor: "pointer", fontSize: 13, fontFamily: "'DM Mono', monospace",
    background: "transparent", transition: "all 0.2s",
  });
  const pillBtn = (active, onClick, label) => (
    <button onClick={onClick} style={{
      padding: "5px 14px", borderRadius: 4, border: `1px solid ${T.border2}`,
      background: active ? T.accent : T.inputBg,
      color: active ? "#fff" : T.textMid,
      cursor: "pointer", fontSize: 12, fontFamily: "'DM Mono', monospace",
    }}>{label}</button>
  );

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: T.card, border: `1px solid ${T.border2}`, borderRadius: 8, padding: "10px 14px", fontSize: 12, fontFamily: "'DM Mono', monospace" }}>
        <div style={{ color: T.textMid, marginBottom: 4 }}>{label}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ color: p.color || T.text }}>
            {p.name}: {p.name === "Risk" ? p.value?.toFixed(3) : fmtC(p.value)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ background: T.bg, minHeight: "100vh", color: T.text, fontFamily: "'DM Mono', monospace", padding: "24px 28px" }}>
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
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: -0.8,
              background: "linear-gradient(90deg, #a78bfa 0%, #60a5fa 50%, #34d399 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text"
            }}>
              Reversion Alpha
            </h1>
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 28, fontWeight: 800, letterSpacing: -0.8, color: darkMode ? "#fff" : T.text }}>
              DCA Pro
            </span>
          </div>
          <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, margin: "6px 0 0", letterSpacing: 0.3, color: darkMode ? "#94a3b8" : T.label, fontStyle: "italic" }}>
            Simulate, Optimize, and Execute Quantitative DCA Strategies.
          </p>
          <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, margin: "6px 0 0", letterSpacing: 0.2, color: darkMode ? "#64748b" : T.textDim }}>
            Input Asset Ticker, DCA amount and parameters to simulate different accumulation and distribution strategies.
          </p>
        </div>
        <div style={{ textAlign: "right", fontSize: 11, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* Defaults dropdown */}
            <div style={{ position: "relative" }}>
              <button onClick={() => setShowDefaultsMenu(m => !m)} style={{
                background: T.inputBg, border: `1px solid ${T.border2}`,
                borderRadius: 20, padding: "4px 12px", cursor: "pointer",
                fontSize: 12, color: T.textMid, fontFamily: "'DM Mono', monospace",
                display: "flex", alignItems: "center", gap: 6,
              }}>Defaults <span style={{ fontSize: 10 }}>▾</span></button>
              {showDefaultsMenu && (
                <div style={{
                  position: "absolute", top: "calc(100% + 6px)", right: 0,
                  background: T.card, border: `1px solid ${T.border2}`,
                  borderRadius: 8, overflow: "hidden", zIndex: 999, minWidth: 160,
                  boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                }}>
                  {[
                    { label: "Save as default", action: () => {
                      const settings = {
                        assetId, customTicker, frequency, startDate,
                        riskBandIdx, strategy, riskOffset,
                        sellEnabled, sell90, initEnabled,
                        initShares, initAvgPrice, initDate,
                        leapEnabled, ccEnabled, ccPremiumPct,
                        leap09, leapCostPct, leapDelta,
                        baseAmount, dayOfMonth,
                      };
                      localStorage.setItem(USER_DEFAULTS_KEY, JSON.stringify(settings));
                      setShowDefaultsMenu(false);
                      alert("✓ Settings saved as your default");
                    }},
                    { label: "Reset settings", action: () => {
                      localStorage.removeItem(USER_DEFAULTS_KEY);
                      const d = MASTER_DEFAULTS;
                      setAssetId(d.assetId); setCustomTicker(d.customTicker);
                      setFrequency(d.frequency); setStartDate(d.startDate);
                      setRiskBandIdx(d.riskBandIdx); setStrategy(d.strategy);
                      setRiskOffset(d.riskOffset); setSellEnabled(d.sellEnabled);
                      setSell90(d.sell90); setInitEnabled(d.initEnabled);
                      setInitShares(d.initShares); setInitAvgPrice(d.initAvgPrice);
                      setInitDate(d.initDate); setLeapEnabled(d.leapEnabled);
                      setCcEnabled(d.ccEnabled); setCcPremiumPct(d.ccPremiumPct);
                      setLeap09(d.leap09); setLeapCostPct(d.leapCostPct);
                      setLeapDelta(d.leapDelta); setBaseAmount(d.baseAmount);
                      setDayOfMonth(d.dayOfMonth);
                      setShowDefaultsMenu(false);
                    }},
                  ].map(({ label, action }) => (
                    <button key={label} onClick={action} style={{
                      display: "block", width: "100%", textAlign: "left",
                      padding: "10px 16px", background: "transparent",
                      border: "none", color: T.text, fontSize: 12,
                      fontFamily: "'DM Mono', monospace", cursor: "pointer",
                    }}
                    onMouseEnter={e => e.target.style.background = T.inputBg}
                    onMouseLeave={e => e.target.style.background = "transparent"}
                    >{label}</button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => setDarkMode(m => !m)} style={{
              background: T.inputBg, border: `1px solid ${T.border2}`,
              borderRadius: 20, padding: "4px 12px", cursor: "pointer",
              fontSize: 12, color: T.textMid, fontFamily: "'DM Mono', monospace",
            }}>{darkMode ? "☀ Day" : "🌙 Night"}</button>
          </div>
          {loading && <span style={{ color: T.accent }}>{`⟳ Fetching live ${displayLabel} price history...`}</span>}
          {!loading && error && <span style={{ color: "#f59e0b" }}>⚠ {error}</span>}
          {!loading && !error && lastUpdated && (
            <span style={{ color: "#22c55e" }}>✓ Live data · {lastUpdated.toLocaleTimeString()}</span>
          )}
          {!loading && <div style={{ color: T.textFaint, fontSize: 10 }}>{dailyData.length.toLocaleString()} daily data points</div>}
        </div>
      </div>

      {/* Card */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>

        {/* Tabs */}
        <div style={{ borderBottom: `1px solid ${T.border}`, display: "flex", padding: "0 16px" }}>
          <button style={tabStyle("equal")} onClick={() => setTab("equal")}>Equal $ DCA</button>
          <button style={tabStyle("lump")} onClick={() => setTab("lump")}>Lump $um</button>
          <button style={tabStyle("dynamic")} onClick={() => setTab("dynamic")}>Precision DCA</button>
          <button style={{...tabStyle("portfolio"), marginLeft: "auto"}} onClick={() => setTab("portfolio")}>📊 Portfolio Tracker</button>
        </div>

        {/* Company Name Banner */}
        {tab !== "portfolio" && (
        <div style={{ padding: "10px 20px 0", borderBottom: "none" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 700, color: T.accent, letterSpacing: -0.5 }}>
              {displayTicker}
            </span>
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 400, color: T.textMid }}>
              {companyName}
            </span>
            {stats && (
              <span style={{ marginLeft: "auto", fontFamily: "'DM Mono', monospace", fontSize: 13, color: T.text }}>
                {fmtC(stats.lastPrice)}
                <span style={{ fontSize: 11, marginLeft: 6, color: stats.dailyChangePct >= 0 ? "#22c55e" : "#ef4444" }}>
                  {stats.dailyChangePct >= 0 ? "▲" : "▼"} {Math.abs(stats.dailyChangePct)}%
                </span>
              </span>
            )}
          </div>
        </div>
        )}

        {/* Controls — hidden on portfolio tab */}
        {tab !== "portfolio" && (
        <div style={{ padding: "12px 20px 16px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start", rowGap: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: T.label, marginBottom: 4 }}>Asset Ticker</div>
              <div style={{ display: "flex", gap: 4 }}>
                <input
                  type="text"
                  style={{ ...inputStyle, width: 90, textTransform: "uppercase" }}
                  value={tickerInput}
                  onChange={e => setTickerInput(e.target.value.toUpperCase())}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      const t = tickerInput.trim().toUpperCase();
                      if (!t) return;
                      const known = ASSETS.find(a => a.id === t);
                      if (known) { setAssetId(t); setCustomTicker(null); }
                      else setCustomTicker(t);
                    }
                  }}
                  placeholder="SPY"
                  maxLength={10}
                />
                <button
                  onClick={() => {
                    const t = tickerInput.trim().toUpperCase();
                    if (!t) return;
                    const known = ASSETS.find(a => a.id === t);
                    if (known) { setAssetId(t); setCustomTicker(null); }
                    else setCustomTicker(t);
                  }}
                  style={{ ...inputStyle, cursor: "pointer", padding: "0 12px", background: T.border, color: T.accent, border: "1px solid #6C8EFF", flexShrink: 0 }}
                >Go</button>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: T.label, marginBottom: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>{tab === "lump" ? `${currency} Amount` : `${currency} Amount *x`}</span>
              </div>
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
              <div style={{ fontSize: 10, color: T.label, marginBottom: 4 }}>Currency</div>
              <div style={{ display: "flex", gap: 4 }}>
                {pillBtn(currency === "USD", () => setCurrency("USD"), "USD")}
                {pillBtn(currency === "CAD", () => setCurrency("CAD"), "CAD")}
              </div>
              {currency === "CAD" && (
                <div style={{ fontSize: 9, color: T.textDim, marginTop: 3 }}>
                  Rate: 1 USD = {cadRate.toFixed(4)} CAD
                </div>
              )}
            </div>
            {tab !== "lump" && (
              <div>
                <div style={{ fontSize: 10, color: T.label, marginBottom: 4 }}>Repeat Purchase</div>
                <select style={{ ...inputStyle, cursor: "pointer" }} value={frequency} onChange={e => setFrequency(e.target.value)}>
                  <option>Daily</option><option>Weekly</option><option>Monthly</option>
                </select>
              </div>
            )}
            {tab !== "lump" && frequency === "Monthly" && (
              <div>
                <div style={{ fontSize: 10, color: T.label, marginBottom: 4 }}>Day of month</div>
                <select style={{ ...inputStyle, cursor: "pointer" }} value={dayOfMonth} onChange={e => setDayOfMonth(Number(e.target.value))}>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
            )}
            <div>
              <div style={{ fontSize: 10, color: T.label, marginBottom: 4 }}>{tab === "lump" ? "Purchase Date" : "Starting Date"}</div>
              <input type="date" style={inputStyle} value={startDate}
                min={minDate} max={endDate}
                onChange={e => setStartDate(e.target.value)} />
            </div>
            {tab !== "lump" && (
              <div>
                <div style={{ fontSize: 10, color: T.label, marginBottom: 4 }}>Ending Date</div>
                <input type="date" style={inputStyle} value={endDate}
                  min={startDate} max={maxDate}
                  onChange={e => setEndDate(e.target.value)} />
              </div>
            )}
          </div>

          {tab === "dynamic" && (
            <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 10, color: T.label, marginBottom: 4 }}>Accumulate up to risk...</div>
                <select style={{ ...inputStyle, cursor: "pointer" }} value={riskBandIdx} onChange={e => setRiskBandIdx(Number(e.target.value))}>
                  {RISK_BANDS.map((b, i) => <option key={i} value={i}>{b.label}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 10, color: T.label, marginBottom: 4 }}>Buying strategy</div>
                <div style={{ display: "flex", gap: 4 }}>
                  {pillBtn(strategy === "Linear", () => setStrategy("Linear"), "Linear")}
                  {pillBtn(strategy === "Exponential", () => setStrategy("Exponential"), "Exponential")}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: T.label, marginBottom: 4 }}>Scale</div>
                <div style={{ display: "flex", gap: 4 }}>
                  {pillBtn(scaleY === "Lin", () => setScaleY("Lin"), "Lin")}
                  {pillBtn(scaleY === "Log", () => setScaleY("Log"), "Log")}
                </div>
              </div>
              {strategy === "Exponential" && (
                <div style={{ fontSize: 11, color: T.textDim, alignSelf: "flex-end", paddingBottom: 2 }}>
                  Exponentially increasing amounts: x, 2x, 4x, 8x...
                </div>
              )}
              {strategy === "Linear" && (
                <div style={{ fontSize: 11, color: T.textDim, alignSelf: "flex-end", paddingBottom: 2 }}>
                  {`$${baseAmount.toLocaleString()} × 1x, 2x, 3x... stepping up every 0.1 below ${riskBand.label}`}
                </div>
              )}
              <div>
                <div style={{ fontSize: 10, color: T.label, marginBottom: 4 }}>
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

          {/* Sell Strategy — always visible */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 10, color: T.label, marginBottom: 4 }}>Sell Strategy</div>
              <div style={{ display: "flex", gap: 4 }}>
                {pillBtn(!sellEnabled, () => setSellEnabled(false), "Off")}
                {pillBtn(sellEnabled, () => setSellEnabled(true), "On")}
              </div>
            </div>
            {sellEnabled && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingBottom: 2 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 11 }}>
                  <input type="checkbox" checked={sell90} onChange={e => setSell90(e.target.checked)}
                    style={{ accentColor: "#f59e0b", width: 14, height: 14, cursor: "pointer" }} />
                  <span style={{ color: sell90 ? "#f59e0b" : "#555" }}>Sell <strong>10%</strong> at risk &gt; 0.90</span>
                </label>
              </div>
            )}
          </div>

          {/* LEAP Strategy */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginTop: 12, flexWrap: "wrap", paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
            <div>
              <div style={{ fontSize: 10, color: T.label, marginBottom: 4 }}>LEAP Options</div>
              <div style={{ display: "flex", gap: 4 }}>
                {pillBtn(!leapEnabled, () => setLeapEnabled(false), "Off")}
                {pillBtn(leapEnabled, () => setLeapEnabled(true), "On")}
              </div>
            </div>
            {leapEnabled && (<>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 2 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 11 }}>
                  <input type="checkbox" checked={leap09} onChange={e => setLeap09(e.target.checked)}
                    style={{ accentColor: "#a78bfa", width: 14, height: 14, cursor: "pointer" }} />
                  <span style={{ color: leap09 ? "#a78bfa" : T.textDim }}>Buy LEAP at risk 0.00 – 0.099</span>
                </label>
              </div>
              <div>
                <div style={{ fontSize: 10, color: T.label, marginBottom: 4 }}>
                  LEAP Cost <span style={{ color: "#a78bfa" }}>{(leapCostPct * 100).toFixed(0)}% of price</span>
                </div>
                <input type="range" min="0.20" max="0.60" step="0.01"
                  value={leapCostPct}
                  onChange={e => setLeapCostPct(parseFloat(e.target.value))}
                  style={{ width: 100, accentColor: "#a78bfa", cursor: "pointer" }} />
              </div>
              <div>
                <div style={{ fontSize: 10, color: T.label, marginBottom: 4 }}>
                  Delta <span style={{ color: "#a78bfa" }}>{leapDelta.toFixed(2)}</span>
                </div>
                <input type="range" min="0.60" max="0.90" step="0.01"
                  value={leapDelta}
                  onChange={e => setLeapDelta(parseFloat(e.target.value))}
                  style={{ width: 100, accentColor: "#a78bfa", cursor: "pointer" }} />
              </div>
              <div style={{ alignSelf: "flex-end", fontSize: 10, color: T.textDim, paddingBottom: 2, lineHeight: 1.6 }}>
                Replaces share buy at<br/>selected risk zones.<br/>
                <span style={{ color: "#a78bfa" }}>Approx. {(1 / leapCostPct).toFixed(1)}x leverage</span>
              </div>
            </>)}
          </div>

          {/* Covered Call */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginTop: 12, flexWrap: "wrap", paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
            <div>
              <div style={{ fontSize: 10, color: T.label, marginBottom: 4 }}>Covered Call</div>
              <div style={{ display: "flex", gap: 4 }}>
                {pillBtn(!ccEnabled, () => setCcEnabled(false), "Off")}
                {pillBtn(ccEnabled, () => setCcEnabled(true), "On")}
              </div>
            </div>
            {ccEnabled && (<>
              <div>
                <div style={{ fontSize: 10, color: T.label, marginBottom: 4 }}>
                  Monthly Premium <span style={{ color: "#06b6d4" }}>{ccPremiumPct.toFixed(2)}% of value</span>
                </div>
                <input type="range" min="0.10" max="2.00" step="0.05"
                  value={ccPremiumPct}
                  onChange={e => setCcPremiumPct(parseFloat(e.target.value))}
                  style={{ width: 120, accentColor: "#06b6d4", cursor: "pointer" }} />
              </div>
              <div style={{ alignSelf: "flex-end", fontSize: 10, color: T.textDim, paddingBottom: 2, lineHeight: 1.7 }}>
                Triggers at risk &gt; 0.90<br/>
                ~0.10 delta · 30 days out<br/>
                <span style={{ color: "#06b6d4" }}>Est. {ccPremiumPct.toFixed(2)}%/mo on holdings</span>
              </div>
            </>)}
          </div>

          {/* Initial Investment */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginTop: 12, flexWrap: "wrap", paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
            <div>
              <div style={{ fontSize: 10, color: T.label, marginBottom: 4 }}>Initial Position</div>
              <div style={{ display: "flex", gap: 4 }}>
                {pillBtn(!initEnabled, () => setInitEnabled(false), "Off")}
                {pillBtn(initEnabled, () => setInitEnabled(true), "On")}
              </div>
            </div>
            {initEnabled && (<>
              <div>
                <div style={{ fontSize: 10, color: T.label, marginBottom: 4 }}>Purchase Date</div>
                <input type="date" style={inputStyle} value={initDate}
                  min={minDate} max={maxDate}
                  onChange={e => setInitDate(e.target.value)} />
              </div>
              <div>
                <div style={{ fontSize: 10, color: T.label, marginBottom: 4 }}>Shares / Units</div>
                <input type="number" style={{ ...inputStyle, width: 110 }}
                  value={initShares} onChange={e => setInitShares(e.target.value)}
                  placeholder="e.g. 10" inputMode="numeric" />
              </div>
              <div>
                <div style={{ fontSize: 10, color: T.label, marginBottom: 4 }}>Avg Price Paid</div>
                <input type="number" style={{ ...inputStyle, width: 120 }}
                  value={initAvgPrice} onChange={e => setInitAvgPrice(e.target.value)}
                  placeholder="e.g. 45000" inputMode="numeric" />
              </div>
              {initShares && initAvgPrice && (
                <div style={{ alignSelf: "flex-end", paddingBottom: 2 }}>
                  <div style={{ fontSize: 10, color: T.textDim }}>Total Cost</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.accent, fontFamily: "'Space Grotesk', sans-serif" }}>
                    {fmtC((parseFloat(initShares) || 0) * (parseFloat(initAvgPrice) || 0))}
                  </div>
                </div>
              )}
            </>)}
          </div>
        </div>
        )} {/* end tab !== portfolio controls */}

        {/* Simulator content — hidden on portfolio tab */}
        {tab !== "portfolio" && (<>

        {/* Loading */}
        {loading && (
          <div style={{ padding: 60, textAlign: "center", color: T.accent, fontSize: 13 }}>
            {`⟳ Fetching live ${displayLabel} price history...`}
          </div>
        )}

        {/* Main Content */}
        {!loading && (
          <div style={{ display: "flex" }}>
            <div style={{ flex: 1, minWidth: 0, padding: "20px" }}>

              {/* Portfolio Chart */}
              <div style={{ marginBottom: 32 }}>
                <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 500, color: T.text, fontFamily: "'Space Grotesk', sans-serif" }}>
                  {`${displayTicker} — Simulated Portfolio Value Over Time`}
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
                    <Legend wrapperStyle={{ fontSize: 11, color: T.textMid }} />
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
                <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 500, color: T.text, fontFamily: "'Space Grotesk', sans-serif" }}>
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

                    {/* Linear mode — show each tier like exponential */}
                    {tab === "dynamic" && strategy === "Linear" && linearTiers.map(({ y1, y2, mult }, idx) => {
                      const alpha = 0.13 + (idx / Math.max(linearTiers.length - 1, 1)) * 0.33;
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

                    <Line type="monotone" dataKey="risk" name="Risk" stroke="#aabbff" strokeWidth={1.5} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Stats Panel */}
            {stats && (
              <div style={{ width: 210, borderLeft: "1px solid #1a1a3a", padding: "24px 20px", display: "flex", flexDirection: "column", gap: 24 }}>
                <div>
                  <div style={{ fontSize: 10, color: T.textDim, marginBottom: 4 }}>Total Invested</div>
                  <div style={{ fontSize: 24, fontWeight: 600, color: "#fff", fontFamily: "'Space Grotesk', sans-serif" }}>
                    {fmtC(stats.totalInvested)}
                  </div>
                  <div style={{ fontSize: 10, color: T.label, marginTop: 2 }}>
                    {tab === "dynamic"
                      ? `${stats.buyCount} of ${stats.totalPeriods} scheduled ${frequency.toLowerCase()} periods`
                      : `Over ${stats.totalPeriods} scheduled periods`}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 10, color: T.textDim, marginBottom: 4 }}>Accumulated Asset</div>
                  <div style={{ fontSize: 20, fontWeight: 600, color: "#fff", fontFamily: "'Space Grotesk', sans-serif" }}>
                    {stats.totalAsset.toFixed(5)} <span style={{ fontSize: 12, color: T.textMid }}>{displayTicker}</span>
                  </div>
                  <div style={{ fontSize: 10, color: T.label, marginTop: 4 }}>Average: {fmtC(stats.avgPrice)}</div>
                  <div style={{ fontSize: 10, color: T.label }}>Last: {fmtC(stats.lastPrice)}</div>
                </div>

                <div>
                  <div style={{ fontSize: 10, color: T.textDim, marginBottom: 4 }}>Current Portfolio Value</div>
                  <div style={{ fontSize: 20, fontWeight: 600, color: "#fff", fontFamily: "'Space Grotesk', sans-serif" }}>
                    {fmtC(stats.currentPortfolio)}
                  </div>
                  <div style={{ fontSize: 11, marginTop: 4, color: stats.gain >= 0 ? "#22c55e" : "#ef4444" }}>
                    {stats.gain >= 0 ? "+" : ""}{fmtC(stats.gain)} ({stats.gainPct}%)
                  </div>
                  {leapEnabled && stats.leapCount > 0 && (
                    <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px dashed ${T.border}` }}>
                      <div style={{ fontSize: 10, color: T.textDim }}>+ LEAP Value (Δ-adj)</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#a78bfa", marginTop: 2 }}>
                        {fmtC(Math.max(0, stats.leapPortfolioValue))}
                      </div>
                      <div style={{ fontSize: 10, color: T.textDim, marginTop: 4 }}>At Expiry (intrinsic)</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#c4b5fd", marginTop: 2 }}>
                        {fmtC(stats.leapExpiryValue)}
                      </div>
                      <div style={{ fontSize: 10, color: T.textDim, marginTop: 8 }}>Combined Total</div>
                      {(() => {
                        const combined = stats.currentPortfolio + Math.max(0, stats.leapPortfolioValue);
                        const combinedGain = combined - stats.totalInvested;
                        const combinedGainPct = stats.totalInvested > 0 ? ((combined / stats.totalInvested - 1) * 100).toFixed(2) : 0;
                        return (<>
                          <div style={{ fontSize: 20, fontWeight: 600, color: "#fff", marginTop: 2, fontFamily: "'Space Grotesk', sans-serif" }}>
                            {fmtC(combined)}
                          </div>
                          <div style={{ fontSize: 11, marginTop: 4, color: combinedGain >= 0 ? "#22c55e" : "#ef4444" }}>
                            {combinedGain >= 0 ? "+" : ""}{fmtC(combinedGain)} ({combinedGainPct}%)
                          </div>
                        </>);
                      })()}
                    </div>
                  )}
                </div>

                {ccEnabled && stats.ccCount > 0 && (
                  <div>
                    <div style={{ fontSize: 10, color: T.textDim, marginBottom: 4 }}>Covered Call Income</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: "#06b6d4", fontFamily: "'Space Grotesk', sans-serif" }}>
                      {fmtC(stats.totalCcIncome)}
                    </div>
                    <div style={{ fontSize: 10, color: T.label, marginTop: 2 }}>
                      {stats.ccCount} call{stats.ccCount !== 1 ? "s" : ""} written at risk &gt; 0.90
                    </div>
                    <div style={{ fontSize: 10, color: T.textDim, marginTop: 2 }}>
                      Avg premium: {fmtC(stats.totalCcIncome / stats.ccCount)}
                    </div>
                  </div>
                )}

                {leapEnabled && stats.leapCount > 0 && (
                  <div>
                    <div style={{ fontSize: 10, color: T.textDim, marginBottom: 4 }}>LEAP Summary</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#a78bfa", fontFamily: "'Space Grotesk', sans-serif" }}>
                      {stats.leapCount} purchase{stats.leapCount !== 1 ? "s" : ""}
                    </div>
                    <div style={{ fontSize: 10, color: T.label, marginTop: 3 }}>
                      Invested: {fmtC(stats.totalLeapInvested)}
                    </div>
                    <div style={{ fontSize: 10, color: T.label, marginTop: 2 }}>
                      Avg entry: {fmtC(stats.avgLeapEntry)}
                    </div>
                    {stats.leapClosedCount > 0 && (
                      <div style={{ fontSize: 10, marginTop: 4, color: stats.leapRealizedPnl >= 0 ? "#22c55e" : "#ef4444" }}>
                        {stats.leapClosedCount} expired · Realized: {stats.leapRealizedPnl >= 0 ? "+" : ""}{fmtC(stats.leapRealizedPnl)}
                      </div>
                    )}
                    {stats.openLeapCount > 0 && (
                      <div style={{ fontSize: 10, color: T.textDim, marginTop: 2 }}>
                        {stats.openLeapCount} still open
                      </div>
                    )}
                    {(() => {
                      const leapPnl = stats.leapPortfolioValue - stats.totalLeapInvested;
                      const leapPnlExpiry = stats.leapExpiryValue - stats.totalLeapInvested;
                      return (<>
                        <div style={{ fontSize: 11, marginTop: 6, color: leapPnl >= 0 ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
                          Δ-adj P&L: {leapPnl >= 0 ? "+" : ""}{fmtC(leapPnl)}
                        </div>
                        <div style={{ fontSize: 11, marginTop: 2, color: leapPnlExpiry >= 0 ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
                          Expiry P&L: {leapPnlExpiry >= 0 ? "+" : ""}{fmtC(leapPnlExpiry)}
                        </div>
                        <div style={{ fontSize: 9, color: T.textDim, marginTop: 4, lineHeight: 1.5 }}>
                          Strike = 92% of entry.<br/>Expiry = intrinsic value.<br/>Δ-adj = intrinsic + decayed extrinsic.
                        </div>
                      </>);
                    })()}
                  </div>
                )}

                {sellEnabled && stats.totalSellProceeds > 0 && (
                  <div>
                    <div style={{ fontSize: 10, color: T.textDim, marginBottom: 4 }}>Sell Proceeds</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: "#f59e0b", fontFamily: "'Space Grotesk', sans-serif" }}>
                      {fmtC(stats.totalSellProceeds)}
                    </div>
                    <div style={{ fontSize: 10, color: T.label, marginTop: 2 }}>
                      {stats.sellCount} sell event{stats.sellCount !== 1 ? "s" : ""}
                    </div>
                    {stats.totalSellAsset > 0 && (
                      <div style={{ fontSize: 10, color: T.textDim, marginTop: 4 }}>
                        Avg sell price
                        <span style={{ color: "#f59e0b", fontWeight: 600, marginLeft: 6 }}>
                          {fmtC(stats.totalSellProceeds / stats.totalSellAsset)}
                        </span>
                      </div>
                    )}
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
                      <div style={{ fontSize: 10, color: T.textDim, marginBottom: 4 }}>Net P&amp;L (with sells)</div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: stats.sellPnl >= 0 ? "#22c55e" : "#ef4444", fontFamily: "'Space Grotesk', sans-serif" }}>
                        {stats.sellPnl >= 0 ? "+" : ""}{fmtC(stats.sellPnl)}
                      </div>
                      <div style={{ fontSize: 11, marginTop: 2, color: stats.sellPnl >= 0 ? "#22c55e" : "#ef4444" }}>
                        {stats.sellPnl >= 0 ? "+" : ""}{stats.sellPnlPct}% vs invested
                      </div>
                      <div style={{ fontSize: 10, color: T.textDim, marginTop: 6 }}>
                        Portfolio + Proceeds − Invested
                      </div>
                      {(() => {
                        const diff = (stats.currentPortfolio + stats.totalSellProceeds) - stats.noSellPortfolio;
                        const isAhead = diff >= 0;
                        return (
                          <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed #1a1a3a" }}>
                            <div style={{ fontSize: 10, color: T.textDim, marginBottom: 2 }}>vs Holding (no sells)</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: isAhead ? "#22c55e" : "#ef4444" }}>
                              {isAhead ? "+" : ""}{fmtC(diff)}
                            </div>
                            <div style={{ fontSize: 10, color: isAhead ? "#22c55e" : "#ef4444" }}>
                              {isAhead ? "▲ Sell strategy helped" : "▼ Sell strategy hurt"}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* Combined Strategy Summary — shows when 2+ features active */}
                {(() => {
                  const activeFeatures = [
                    true,
                    sellEnabled && stats.totalSellProceeds > 0,
                    leapEnabled && stats.leapCount > 0,
                    ccEnabled && stats.ccCount > 0,
                  ].filter(Boolean).length;

                  if (activeFeatures < 2) return null;

                  const shareValue   = stats.currentPortfolio;
                  const sellProceeds = (sellEnabled && stats.totalSellProceeds > 0) ? stats.totalSellProceeds : 0;
                  const leapValue    = (leapEnabled && stats.leapCount > 0) ? Math.max(0, stats.leapPortfolioValue) : 0;
                  const ccIncomeTot  = (ccEnabled && stats.ccCount > 0) ? stats.totalCcIncome : 0;
                  const totalValue   = shareValue + sellProceeds + leapValue + ccIncomeTot;
                  const totalGain    = totalValue - stats.totalInvested;
                  const totalPct     = stats.totalInvested > 0 ? ((totalValue / stats.totalInvested - 1) * 100).toFixed(2) : 0;
                  const isPos        = totalGain >= 0;

                  return (
                    <div style={{ marginTop: 4, paddingTop: 16, borderTop: `2px solid ${T.accent}` }}>
                      <div style={{ fontSize: 10, color: T.accent, marginBottom: 8, letterSpacing: 1, textTransform: "uppercase" }}>
                        Combined Strategy
                      </div>

                      {/* Simple additive breakdown */}
                      <div style={{ fontSize: 10, color: T.textDim, marginBottom: 3 }}>
                        Shares value:
                        <span style={{ color: T.text, float: "right" }}>{fmtC(shareValue)}</span>
                      </div>
                      {sellEnabled && sellProceeds > 0 && (
                        <div style={{ fontSize: 10, color: T.textDim, marginBottom: 3 }}>
                          + Sell proceeds:
                          <span style={{ color: "#f59e0b", float: "right" }}>{fmtC(sellProceeds)}</span>
                        </div>
                      )}
                      {leapEnabled && leapValue > 0 && (
                        <div style={{ fontSize: 10, color: T.textDim, marginBottom: 3 }}>
                          + LEAP value:
                          <span style={{ color: "#a78bfa", float: "right" }}>{fmtC(leapValue)}</span>
                        </div>
                      )}
                      {ccEnabled && ccIncomeTot > 0 && (
                        <div style={{ fontSize: 10, color: T.textDim, marginBottom: 3 }}>
                          + CC income:
                          <span style={{ color: "#06b6d4", float: "right" }}>{fmtC(ccIncomeTot)}</span>
                        </div>
                      )}

                      {/* Divider */}
                      <div style={{ borderTop: `1px solid ${T.border}`, margin: "8px 0" }} />

                      {/* Total Value */}
                      <div style={{ fontSize: 10, color: T.textDim, marginBottom: 2 }}>Total Value</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", fontFamily: "'Space Grotesk', sans-serif" }}>
                        {fmtC(totalValue)}
                      </div>
                      {/* Net Profit = Total Value − Total Invested */}
                      <div style={{ fontSize: 11, marginTop: 6, color: isPos ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
                        {isPos ? "+" : ""}{fmtC(totalGain)}
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2, color: isPos ? "#22c55e" : "#ef4444", fontFamily: "'Space Grotesk', sans-serif" }}>
                        {isPos ? "+" : ""}{totalPct}%
                      </div>
                      <div style={{ fontSize: 9, color: T.textDim, marginTop: 4 }}>
                        vs {fmtC(stats.totalInvested)} total invested
                      </div>
                    </div>
                  );
                })()}


              </div>
            )}
          </div>
        )}

        {/* Trade History Table */}
        {tradeLog && tradeLog.length > 0 && (
          <div style={{ borderTop: `1px solid ${T.border}`, padding: "20px" }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 500, color: T.text, fontFamily: "'Space Grotesk', sans-serif" }}>
              Simulated Trade History
            </h3>
            <p style={{ margin: "0 0 14px", fontSize: 11, color: T.textDim }}>
              {`Purchase $${baseAmount.toLocaleString()} multiplied by a factor based on ${displayTicker} risk level, every ${frequency.toLowerCase()} on the ${dayOfMonth} — from ${startDate} to ${endDate}`}
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "'DM Mono', monospace" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                    {["Date","Action","Risk","Asset Price","Accumulated","Invested Amount","Portfolio Value"].map(h => (
                      <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: T.textDim, fontWeight: 400, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tradeLog.map((row, i) => {
                    const isBuy = row.action.startsWith("Buy") || row.action === "Lump Sum";
                    const isSell = row.action.startsWith("Sell");
                    const isInit = row.action === "Initial Position";
                    const isLeapRow = row.action?.startsWith("LEAP");
                    const isLeapExpiry = row.leapExpiry === true;
                    const isCcRow = row.action === "Covered Call";
                    const riskColor = row.risk > 0.9 ? "#dc2626" : row.risk > 0.8 ? "#ea580c" : row.risk > 0.6 ? "#ef4444" : row.risk > 0.4 ? "#ca8a04" : row.risk > 0.2 ? "#22c55e" : "#15803d";
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid #0f0f25", background: "transparent" }}>
                        <td style={{ padding: "5px 10px", color: T.textMid, whiteSpace: "nowrap" }}>{row.date}</td>
                        <td style={{ padding: "5px 10px", color: isCcRow ? "#06b6d4" : isLeapExpiry ? (row.leapPnl >= 0 ? "#22c55e" : "#ef4444") : isLeapRow ? "#a78bfa" : isInit ? "#a78bfa" : isSell ? "#f59e0b" : isBuy ? T.accent : T.textDim, fontWeight: 500 }}>
                          {row.action}
                          {isLeapRow && row.leapContracts && <span style={{ color: "#7c6ad6", fontSize: 10, display: "block" }}>{row.leapContracts} contract{row.leapContracts !== 1 ? "s" : ""} × 100 shares</span>}
                        </td>
                        <td style={{ padding: "5px 10px" }}>
                          <span style={{ color: riskColor, background: riskColor + "22", padding: "1px 6px", borderRadius: 3 }}>{row.risk?.toFixed(3)}</span>
                        </td>
                        <td style={{ padding: "5px 10px", color: T.text }}>{fmtC(row.price)}</td>
                        <td style={{ padding: "5px 10px", color: T.text }}>
                          {isLeapExpiry
                            ? <span style={{ color: T.textDim }}>—</span>
                            : <>{row.accumulated?.toFixed(4)} {displayTicker}</>
                          }
                        </td>
                        <td style={{ padding: "5px 10px", color: T.textMid }}>
                          {isLeapExpiry
                            ? <span style={{ color: T.textDim, fontSize: 10 }}>—</span>
                            : fmtC(row.invested ?? 0)
                          }
                        </td>
                        <td style={{ padding: "5px 10px", color: isLeapExpiry ? (row.leapPnl >= 0 ? "#22c55e" : "#ef4444") : isCcRow ? "#06b6d4" : isSell ? "#f59e0b" : isBuy ? "#22c55e" : T.textMid, fontWeight: (isBuy || isSell || isLeapExpiry) ? 500 : 400 }}>
                          {isLeapExpiry
                            ? (<>
                                <span style={{ fontSize: 10, color: T.textDim, display: "block" }}>Intrinsic: {fmtC(row.sellProceeds ?? 0)}</span>
                                <span style={{ fontWeight: 700 }}>{row.leapPnl >= 0 ? "+" : ""}{fmtC(row.leapPnl ?? 0)} P&L</span>
                              </>)
                            : isCcRow
                            ? (<>
                                <span style={{ fontSize: 10, color: T.textDim, display: "block" }}>{row.ccShares ? `${row.ccShares.toFixed(2)} shares (${row.ccContracts > 0 ? row.ccContracts + " contracts equiv." : "< 1 contract"})` : ""}</span>
                                <span>+{fmtC(row.ccIncome ?? 0)} premium</span>
                              </>)
                            : (<>
                                {fmtC(row.portfolioValue ?? 0)}
                                {isSell && row.sellProceeds && <span style={{ color: "#f59e0b", fontSize: 10, display: "block" }}>+{fmtC(row.sellProceeds)} cashed</span>}
                              </>)
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        </>) } {/* end tab !== portfolio simulator content */}

        {/* Portfolio Tracker Tab */}
        {tab === "portfolio" && (
          <div style={{ padding: "24px 20px" }}>
            {/* Header row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 700, margin: 0, color: T.text }}>Portfolio Tracker</h2>
                <p style={{ fontSize: 11, color: T.textDim, margin: "4px 0 0" }}>Manual holdings · Live prices · Risk-based action signals</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => {
                  portfolio.forEach(h => { if (h.ticker) fetchPortfolioPrice(h.ticker); });
                  planned.forEach(h => { if (h.ticker) fetchPortfolioPrice(h.ticker); });
                }} style={{
                  background: T.inputBg, border: `1px solid ${T.border2}`, borderRadius: 6,
                  color: T.textMid, padding: "7px 14px", cursor: "pointer", fontSize: 12, fontFamily: "'DM Mono', monospace",
                }}>⟳ Refresh Prices</button>
                <button onClick={() => setShowCagr(s => !s)} style={{
                  background: showCagr ? T.accent + "33" : T.inputBg,
                  border: `1px solid ${showCagr ? T.accent : T.border2}`,
                  borderRadius: 6, color: showCagr ? T.accent : T.textMid,
                  padding: "7px 14px", cursor: "pointer", fontSize: 12, fontFamily: "'DM Mono', monospace",
                }}>{showCagr ? "Hide CAGR" : "Show CAGR"}</button>
                <button onClick={addHolding} style={{
                  background: T.accent, border: "none", borderRadius: 6,
                  color: "#fff", padding: "7px 16px", cursor: "pointer", fontSize: 12, fontFamily: "'DM Mono', monospace", fontWeight: 600,
                }}>+ Add Asset</button>
              </div>
            </div>

            {portfolio.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: T.textDim }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
                <div style={{ fontSize: 14, color: T.textMid, marginBottom: 6 }}>No holdings yet</div>
                <div style={{ fontSize: 11 }}>Click <strong style={{ color: T.accent }}>+ Add Asset</strong> to start tracking your portfolio</div>
              </div>
            ) : (
              <>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "'DM Mono', monospace" }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                        {["Ticker", "Name", "Live Price", "Shares", "Entry Price", "Market Value", "Gain / Loss", "% of Portfolio", "Signal", ""].map(h => (
                          <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: T.textDim, fontWeight: 400, whiteSpace: "nowrap", fontSize: 11 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const totalPortfolioValue = portfolio.reduce((sum, h) => {
                          const price = portfolioPrices[h.ticker?.toUpperCase()] ?? portfolioPrices[h.ticker] ?? 0;
                          return sum + (price * (parseFloat(h.shares) || 0));
                        }, 0);
                        return portfolio.map((h) => {
                          const upper = h.ticker?.toUpperCase() ?? "";
                          const livePrice = portfolioPrices[upper] ?? portfolioPrices[h.ticker] ?? null;
                          const shares = parseFloat(h.shares) || 0;
                          const entryPrice = parseFloat(h.entryPrice) || 0;
                          const marketValue = livePrice ? livePrice * shares : null;
                          const costBasis = entryPrice * shares;
                          const gainLoss = marketValue != null ? marketValue - costBasis : null;
                          const gainPct = costBasis > 0 && gainLoss != null ? ((gainLoss / costBasis) * 100).toFixed(2) : null;
                          const portfolioPct = totalPortfolioValue > 0 && marketValue ? ((marketValue / totalPortfolioValue) * 100).toFixed(1) : null;
                          const action = getPortfolioAction(h.ticker);
                          const isLoading = portfolioLoading[upper] || portfolioLoading[h.ticker];
                          const knownName = KNOWN_NAMES[upper] ?? "";
                          return (
                            <React.Fragment key={h.id}>
                            <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                              <td style={{ padding: "6px 10px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <input value={h.ticker} onChange={e => updateHolding(h.id, "ticker", e.target.value.toUpperCase())}
                                    onBlur={e => { if (e.target.value) fetchPortfolioPrice(e.target.value); }}
                                    onKeyDown={e => { if (e.key === "Enter" && h.ticker) fetchPortfolioPrice(h.ticker); }}
                                    placeholder="SPY" style={{ ...inputStyle, width: 80, fontSize: 12, fontWeight: 700, color: T.accent }} />
                                  {upper && (
                                    <button title={`Analyze ${upper} in Precision DCA`} onClick={() => {
                                      const known = ASSETS.find(a => a.id === upper);
                                      if (known) { setAssetId(upper); setCustomTicker(null); }
                                      else setCustomTicker(upper);
                                      setTickerInput(upper);
                                      setTab("dynamic");
                                    }} style={{
                                      background: "transparent", border: "none", cursor: "pointer",
                                      color: T.accent, fontSize: 13, padding: "0 2px", lineHeight: 1,
                                      opacity: 0.7,
                                    }}>↗</button>
                                  )}
                                </div>
                              </td>
                              <td style={{ padding: "6px 10px", color: T.text, fontSize: 12, whiteSpace: "nowrap", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>
                                {knownName || upper || "—"}
                              </td>
                              <td style={{ padding: "6px 10px", color: T.text, whiteSpace: "nowrap" }}>
                                {isLoading ? <span style={{ color: T.textDim }}>⟳</span> : livePrice ? fmtC(livePrice) : <span style={{ color: T.textDim }}>—</span>}
                              </td>
                              <td style={{ padding: "6px 10px" }}>
                                <input type="number" value={h.shares} onChange={e => updateHolding(h.id, "shares", e.target.value)}
                                  placeholder="100" style={{ ...inputStyle, width: 90, fontSize: 12 }} />
                              </td>
                              <td style={{ padding: "6px 10px" }}>
                                <input type="number" value={h.entryPrice} onChange={e => updateHolding(h.id, "entryPrice", e.target.value)}
                                  placeholder="450.00" style={{ ...inputStyle, width: 100, fontSize: 12 }} />
                              </td>
                              <td style={{ padding: "6px 10px", color: T.text, fontWeight: 600, whiteSpace: "nowrap" }}>
                                {marketValue != null ? fmtC(marketValue) : <span style={{ color: T.textDim }}>—</span>}
                              </td>
                              <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
                                {gainLoss != null ? (
                                  <div>
                                    <span style={{ color: gainLoss >= 0 ? "#22c55e" : "#ef4444", fontWeight: 600 }}>{gainLoss >= 0 ? "+" : ""}{fmtC(gainLoss)}</span>
                                    <span style={{ display: "block", fontSize: 10, color: gainLoss >= 0 ? "#22c55e" : "#ef4444" }}>{gainLoss >= 0 ? "▲" : "▼"} {Math.abs(gainPct)}%</span>
                                  </div>
                                ) : <span style={{ color: T.textDim }}>—</span>}
                              </td>
                              <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
                                {portfolioPct != null ? (
                                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <div style={{ width: 50, height: 4, background: T.border2, borderRadius: 2 }}>
                                      <div style={{ width: `${Math.min(100, portfolioPct)}%`, height: "100%", background: T.accent, borderRadius: 2 }} />
                                    </div>
                                    <span style={{ color: T.textMid }}>{portfolioPct}%</span>
                                  </div>
                                ) : <span style={{ color: T.textDim }}>—</span>}
                              </td>
                              <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
                                <span style={{ color: action.color, background: action.color + "22", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                                  {action.label}
                                </span>
                                {portfolioRisk[upper] != null && (
                                  <span style={{ display: "block", fontSize: 10, color: T.textDim, marginTop: 2 }}>
                                    risk {portfolioRisk[upper].toFixed(3)}
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: "6px 10px" }}>
                                <button onClick={() => removeHolding(h.id)} style={{
                                  background: "transparent", border: "none", color: T.textDim,
                                  cursor: "pointer", fontSize: 16, padding: "2px 6px", borderRadius: 4,
                                }}>×</button>
                              </td>
                            </tr>
                            {/* CAGR row - always shown, loading state if data not ready */}
                            {showCagr && upper && (
                              <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                                <td colSpan={10} style={{ padding: "0", background: "transparent" }}>
                                  {portfolioCagr[upper] ? (() => {
                                    const c = portfolioCagr[upper];
                                    const fmt = v => v != null ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : "—";
                                    const col = v => v == null ? T.textDim : v >= 12 ? "#86efac" : v >= 7 ? "#93c5fd" : v >= 0 ? "#fcd34d" : "#fca5a5";
                                    return (
                                      <div style={{ display: "flex", width: "100%", alignItems: "center", padding: "4px 16px" }}>
                                        <span style={{ fontSize: 9, color: T.textDim, whiteSpace: "nowrap", width: 70, flexShrink: 0 }}>Hist. CAGR</span>
                                        {[["1yr", c.cagr1], ["3yr", c.cagr3], ["5yr", c.cagr5], ["10yr", c.cagr10]].map(([label, val]) => (
                                          <div key={label} style={{ textAlign: "center", width: 52, flexShrink: 0 }}>
                                            <div style={{ fontSize: 8, color: T.textDim }}>{label}</div>
                                            <div style={{ fontSize: 10, fontWeight: 400, color: T.textMid }}>{fmt(val)}</div>
                                          </div>
                                        ))}
                                        <span style={{ fontSize: 9, color: T.textDim, whiteSpace: "nowrap", width: 52, flexShrink: 0, marginLeft: 8 }}>Est. Fwd</span>
                                        {[["5yr", c.fwd5], ["10yr", c.fwd10], ["20yr", c.fwd20], ["30yr", c.fwd30]].map(([label, val]) => (
                                          <div key={label} style={{ textAlign: "center", width: 52, flexShrink: 0 }}>
                                            <div style={{ fontSize: 8, color: T.textDim }}>{label}</div>
                                            <div style={{ fontSize: 10, fontWeight: 400, color: col(val), fontStyle: "italic" }}>{fmt(val)}</div>
                                          </div>
                                        ))}
                                        <span style={{ fontSize: 8, color: T.textDim, fontStyle: "italic", marginLeft: "auto" }}>mean reversion · not financial advice</span>
                                      </div>
                                    );
                                  })() : (
                                    <div style={{ padding: "5px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                                      <span style={{ fontSize: 10, color: T.textDim }}>CAGR</span>
                                      <span style={{ fontSize: 10, color: T.textDim, fontStyle: "italic" }}>
                                        {portfolioLoading[upper] ? "⟳ loading..." : "refresh prices to load"}
                                      </span>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                            </React.Fragment>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>

                {/* Summary Footer */}
                {(() => {
                  const totalValue = portfolio.reduce((sum, h) => {
                    const price = portfolioPrices[h.ticker?.toUpperCase()] ?? portfolioPrices[h.ticker] ?? 0;
                    return sum + (price * (parseFloat(h.shares) || 0));
                  }, 0);
                  const totalCost = portfolio.reduce((sum, h) => sum + ((parseFloat(h.entryPrice) || 0) * (parseFloat(h.shares) || 0)), 0);
                  const totalGain = totalValue - totalCost;
                  const totalGainPct = totalCost > 0 ? ((totalGain / totalCost) * 100).toFixed(2) : null;
                  if (totalValue === 0) return null;
                  return (
                    <div style={{ marginTop: 20, padding: "16px 20px", background: T.inputBg, borderRadius: 8, border: `1px solid ${T.border2}`, display: "flex", gap: 32, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: 10, color: T.textDim, marginBottom: 3 }}>Total Value</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: T.text, fontFamily: "'Space Grotesk', sans-serif" }}>{fmtC(totalValue)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: T.textDim, marginBottom: 3 }}>Total Cost Basis</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: T.textMid, fontFamily: "'Space Grotesk', sans-serif" }}>{fmtC(totalCost)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: T.textDim, marginBottom: 3 }}>Total Gain / Loss</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: totalGain >= 0 ? "#22c55e" : "#ef4444", fontFamily: "'Space Grotesk', sans-serif" }}>
                          {totalGain >= 0 ? "+" : ""}{fmtC(totalGain)}
                          {totalGainPct && <span style={{ fontSize: 13, marginLeft: 8 }}>{totalGain >= 0 ? "▲" : "▼"} {Math.abs(totalGainPct)}%</span>}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: T.textDim, marginBottom: 3 }}>Positions</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: T.textMid, fontFamily: "'Space Grotesk', sans-serif" }}>{portfolio.filter(h => h.ticker).length}</div>
                      </div>
                    </div>
                  );
                })()}

                {/* ── Planned Portfolio ─────────────────────────────────── */}
                <div style={{ marginTop: 32 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <div>
                      <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 700, margin: 0, color: T.text }}>
                        Planned Portfolio
                      </h3>
                      <p style={{ fontSize: 11, color: T.textDim, margin: "3px 0 0" }}>Target positions · Compare vs actual holdings</p>
                    </div>
                    <button onClick={() => setPlanned(p => [...p, { id: Date.now(), ticker: "", shares: "", entryPrice: "" }])} style={{
                      background: "#7c3aed", border: "none", borderRadius: 6,
                      color: "#fff", padding: "7px 16px", cursor: "pointer", fontSize: 12,
                      fontFamily: "'DM Mono', monospace", fontWeight: 600,
                    }}>+ Add Target</button>
                  </div>

                  {planned.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "32px 0", color: T.textDim, border: `1px dashed ${T.border2}`, borderRadius: 8 }}>
                      <div style={{ fontSize: 11 }}>Click <strong style={{ color: "#a78bfa" }}>+ Add Target</strong> to define your planned positions</div>
                    </div>
                  ) : (
                    <>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "'DM Mono', monospace" }}>
                          <thead>
                            <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                              {["Ticker", "Name", "Live Price", "Target Shares", "Target Entry", "Target Value", "vs Actual", "Target %", "Signal", ""].map(h => (
                                <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "#a78bfa", fontWeight: 400, whiteSpace: "nowrap", fontSize: 11 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              const totalPlannedValue = planned.reduce((sum, h) => {
                                const price = portfolioPrices[h.ticker?.toUpperCase()] ?? 0;
                                return sum + (price * (parseFloat(h.shares) || 0));
                              }, 0);
                              return planned.map((h) => {
                                const upper = h.ticker?.toUpperCase() ?? "";
                                const livePrice = portfolioPrices[upper] ?? null;
                                const targetShares = parseFloat(h.shares) || 0;
                                const targetEntry = parseFloat(h.entryPrice) || 0;
                                const targetValue = livePrice ? livePrice * targetShares : null;
                                const targetCost = targetEntry * targetShares;
                                // Find matching actual holding
                                const actual = portfolio.find(a => a.ticker?.toUpperCase() === upper);
                                const actualShares = parseFloat(actual?.shares) || 0;
                                const actualValue = livePrice ? livePrice * actualShares : null;
                                const diffShares = targetShares - actualShares;
                                const diffValue = (targetValue != null && actualValue != null) ? targetValue - actualValue : null;
                                const plannedPct = totalPlannedValue > 0 && targetValue ? ((targetValue / totalPlannedValue) * 100).toFixed(1) : null;
                                const action = getPortfolioAction(h.ticker);
                                const isLoading = portfolioLoading[upper];
                                const knownName = KNOWN_NAMES[upper] ?? "";
                                return (
                                  <React.Fragment key={h.id}>
                                  <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                                    <td style={{ padding: "6px 10px" }}>
                                      <input value={h.ticker}
                                        onChange={e => setPlanned(p => p.map(x => x.id === h.id ? { ...x, ticker: e.target.value.toUpperCase() } : x))}
                                        onBlur={e => { if (e.target.value) fetchPortfolioPrice(e.target.value); }}
                                        onKeyDown={e => { if (e.key === "Enter" && h.ticker) fetchPortfolioPrice(h.ticker); }}
                                        placeholder="TSLA"
                                        style={{ ...inputStyle, width: 80, fontSize: 12, fontWeight: 700, color: "#a78bfa" }} />
                                    </td>
                                    <td style={{ padding: "6px 10px", color: T.text, fontSize: 12, whiteSpace: "nowrap", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>
                                      {knownName || upper || "—"}
                                    </td>
                                    <td style={{ padding: "6px 10px", color: T.text, whiteSpace: "nowrap" }}>
                                      {isLoading ? <span style={{ color: T.textDim }}>⟳</span> : livePrice ? fmtC(livePrice) : <span style={{ color: T.textDim }}>—</span>}
                                    </td>
                                    <td style={{ padding: "6px 10px" }}>
                                      <input type="number" value={h.shares}
                                        onChange={e => setPlanned(p => p.map(x => x.id === h.id ? { ...x, shares: e.target.value } : x))}
                                        placeholder="100" style={{ ...inputStyle, width: 90, fontSize: 12 }} />
                                    </td>
                                    <td style={{ padding: "6px 10px" }}>
                                      <input type="number" value={h.entryPrice}
                                        onChange={e => setPlanned(p => p.map(x => x.id === h.id ? { ...x, entryPrice: e.target.value } : x))}
                                        placeholder="250.00" style={{ ...inputStyle, width: 100, fontSize: 12 }} />
                                    </td>
                                    <td style={{ padding: "6px 10px", color: "#a78bfa", fontWeight: 600, whiteSpace: "nowrap" }}>
                                      {targetValue != null ? fmtC(targetValue) : <span style={{ color: T.textDim }}>—</span>}
                                    </td>
                                    {/* vs Actual */}
                                    <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
                                      {diffValue != null ? (
                                        <div>
                                          <span style={{ color: diffValue >= 0 ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
                                            {diffValue >= 0 ? "+" : ""}{fmtC(diffValue)}
                                          </span>
                                          <span style={{ display: "block", fontSize: 10, color: T.textDim }}>
                                            {diffShares >= 0 ? "+" : ""}{diffShares.toFixed(2)} shares
                                          </span>
                                        </div>
                                      ) : actual ? (
                                        <span style={{ fontSize: 10, color: T.textDim }}>no price</span>
                                      ) : (
                                        <span style={{ fontSize: 10, color: "#f59e0b" }}>not in actual</span>
                                      )}
                                    </td>
                                    <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
                                      {plannedPct != null ? (
                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                          <div style={{ width: 50, height: 4, background: T.border2, borderRadius: 2 }}>
                                            <div style={{ width: `${Math.min(100, plannedPct)}%`, height: "100%", background: "#7c3aed", borderRadius: 2 }} />
                                          </div>
                                          <span style={{ color: T.textMid }}>{plannedPct}%</span>
                                        </div>
                                      ) : <span style={{ color: T.textDim }}>—</span>}
                                    </td>
                                    <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
                                      <span style={{ color: action.color, background: action.color + "22", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                                        {action.label}
                                      </span>
                                      {portfolioRisk[upper] != null && (
                                        <span style={{ display: "block", fontSize: 10, color: T.textDim, marginTop: 2 }}>risk {portfolioRisk[upper].toFixed(3)}</span>
                                      )}
                                    </td>
                                    <td style={{ padding: "6px 10px" }}>
                                      <button onClick={() => setPlanned(p => p.filter(x => x.id !== h.id))} style={{
                                        background: "transparent", border: "none", color: T.textDim,
                                        cursor: "pointer", fontSize: 16, padding: "2px 6px", borderRadius: 4,
                                      }}>×</button>
                                    </td>
                                  </tr>
                                  {/* CAGR row */}
                                  {showCagr && upper && (
                                    <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                                      <td colSpan={10} style={{ padding: "0", background: "transparent" }}>
                                        {portfolioCagr[upper] ? (() => {
                                          const c = portfolioCagr[upper];
                                          const fmt = v => v != null ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : "—";
                                          const col = v => v == null ? T.textDim : v >= 12 ? "#86efac" : v >= 7 ? "#93c5fd" : v >= 0 ? "#fcd34d" : "#fca5a5";
                                          return (
                                            <div style={{ display: "flex", width: "100%", alignItems: "center", padding: "4px 16px" }}>
                                              <span style={{ fontSize: 9, color: T.textDim, whiteSpace: "nowrap", width: 70, flexShrink: 0 }}>Hist. CAGR</span>
                                              {[["1yr", c.cagr1], ["3yr", c.cagr3], ["5yr", c.cagr5], ["10yr", c.cagr10]].map(([label, val]) => (
                                                <div key={label} style={{ textAlign: "center", width: 52, flexShrink: 0 }}>
                                                  <div style={{ fontSize: 8, color: T.textDim }}>{label}</div>
                                                  <div style={{ fontSize: 10, fontWeight: 400, color: T.textMid }}>{fmt(val)}</div>
                                                </div>
                                              ))}
                                              <span style={{ fontSize: 9, color: T.textDim, whiteSpace: "nowrap", width: 52, flexShrink: 0, marginLeft: 8 }}>Est. Fwd</span>
                                              {[["5yr", c.fwd5], ["10yr", c.fwd10], ["20yr", c.fwd20], ["30yr", c.fwd30]].map(([label, val]) => (
                                                <div key={label} style={{ textAlign: "center", width: 52, flexShrink: 0 }}>
                                                  <div style={{ fontSize: 8, color: T.textDim }}>{label}</div>
                                                  <div style={{ fontSize: 10, fontWeight: 400, color: col(val), fontStyle: "italic" }}>{fmt(val)}</div>
                                                </div>
                                              ))}
                                              <span style={{ fontSize: 8, color: T.textDim, fontStyle: "italic", marginLeft: "auto" }}>mean reversion · not financial advice</span>
                                            </div>
                                          );
                                        })() : (
                                          <div style={{ background: darkMode ? "#1a0a2e" : "#ece0ff", padding: "5px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                                            <span style={{ fontSize: 10, color: T.textDim }}>CAGR</span>
                                            <span style={{ fontSize: 10, color: T.textDim, fontStyle: "italic" }}>
                                              {portfolioLoading[upper] ? "⟳ loading..." : "refresh prices to load"}
                                            </span>
                                          </div>
                                        )}
                                      </td>
                                    </tr>
                                  )}
                                  </React.Fragment>
                                );
                              });
                            })()}
                          </tbody>
                        </table>
                      </div>

                      {/* Planned Summary Footer */}
                      {(() => {
                        const totalValue = planned.reduce((sum, h) => {
                          const price = portfolioPrices[h.ticker?.toUpperCase()] ?? 0;
                          return sum + (price * (parseFloat(h.shares) || 0));
                        }, 0);
                        const totalCost = planned.reduce((sum, h) => sum + ((parseFloat(h.entryPrice) || 0) * (parseFloat(h.shares) || 0)), 0);
                        const totalGain = totalValue - totalCost;
                        const totalGainPct = totalCost > 0 ? ((totalGain / totalCost) * 100).toFixed(2) : null;
                        // Compare planned total vs actual total
                        const actualTotal = portfolio.reduce((sum, h) => {
                          const price = portfolioPrices[h.ticker?.toUpperCase()] ?? 0;
                          return sum + (price * (parseFloat(h.shares) || 0));
                        }, 0);
                        const diff = totalValue - actualTotal;
                        if (totalValue === 0) return null;
                        return (
                          <div style={{ marginTop: 12, padding: "16px 20px", background: "#1a0a2e", borderRadius: 8, border: `1px solid #4c1d95`, display: "flex", gap: 32, flexWrap: "wrap" }}>
                            <div>
                              <div style={{ fontSize: 10, color: T.textDim, marginBottom: 3 }}>Planned Value</div>
                              <div style={{ fontSize: 20, fontWeight: 700, color: "#a78bfa", fontFamily: "'Space Grotesk', sans-serif" }}>{fmtC(totalValue)}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 10, color: T.textDim, marginBottom: 3 }}>Planned Cost</div>
                              <div style={{ fontSize: 20, fontWeight: 700, color: T.textMid, fontFamily: "'Space Grotesk', sans-serif" }}>{fmtC(totalCost)}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 10, color: T.textDim, marginBottom: 3 }}>Projected Gain</div>
                              <div style={{ fontSize: 20, fontWeight: 700, color: totalGain >= 0 ? "#22c55e" : "#ef4444", fontFamily: "'Space Grotesk', sans-serif" }}>
                                {totalGain >= 0 ? "+" : ""}{fmtC(totalGain)}
                                {totalGainPct && <span style={{ fontSize: 13, marginLeft: 8 }}>{totalGain >= 0 ? "▲" : "▼"} {Math.abs(totalGainPct)}%</span>}
                              </div>
                            </div>
                            {actualTotal > 0 && (
                              <div>
                                <div style={{ fontSize: 10, color: T.textDim, marginBottom: 3 }}>vs Actual Portfolio</div>
                                <div style={{ fontSize: 20, fontWeight: 700, color: diff >= 0 ? "#22c55e" : "#ef4444", fontFamily: "'Space Grotesk', sans-serif" }}>
                                  {diff >= 0 ? "+" : ""}{fmtC(diff)}
                                </div>
                              </div>
                            )}
                            <div>
                              <div style={{ fontSize: 10, color: T.textDim, marginBottom: 3 }}>Targets</div>
                              <div style={{ fontSize: 20, fontWeight: 700, color: T.textMid, fontFamily: "'Space Grotesk', sans-serif" }}>{planned.filter(h => h.ticker).length}</div>
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}


      </div>

      <p style={{ fontSize: 10, color: T.border2, marginTop: 12, textAlign: "center" }}>
        {`${asset.type === "crypto" ? "Data: Binance API" : "Data: Yahoo Finance (via corsproxy.io)"} · Risk: 500-day geometric MA model · Not financial advice`}
      </p>
    </div>
  );
}
