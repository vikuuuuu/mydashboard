"use client";

import { useEffect, useMemo, useState } from "react";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getCurrentUser } from "@/lib/firebaseAuth";
import styles from "./myfinancials.module.css";

const DEFAULT_HOLDINGS = [
  { symbol: "AAPL", name: "Apple Inc.", type: "Stock", qty: 12, avgPrice: 176.3 },
  { symbol: "MSFT", name: "Microsoft", type: "Stock", qty: 8, avgPrice: 362.1 },
  { symbol: "TSLA", name: "Tesla", type: "Stock", qty: 6, avgPrice: 244.2 },
  { symbol: "VOO", name: "Vanguard S&P 500 ETF", type: "ETF", qty: 10, avgPrice: 463.4 },
  { symbol: "QQQ", name: "Invesco QQQ ETF", type: "ETF", qty: 9, avgPrice: 447.9 },
];

function MiniBarChart({ rows }) {
  const maxValue = Math.max(...rows.map((row) => row.marketValue), 1);

  return (
    <div className={styles.chartWrap}>
      {rows.map((row) => (
        <div key={row.symbol} className={styles.barRow}>
          <span className={styles.barLabel}>{row.symbol}</span>
          <div className={styles.barTrack}>
            <div
              className={styles.barFill}
              style={{ width: `${(row.marketValue / maxValue) * 100}%` }}
            />
          </div>
          <span className={styles.barValue}>${row.marketValue.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

export default function MyFinancialsPage() {
  const [holdings, setHoldings] = useState(DEFAULT_HOLDINGS);
  const [quoteMap, setQuoteMap] = useState({});
  const [asOf, setAsOf] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    let active = true;

    const loadPortfolio = async () => {
      const user = getCurrentUser();
      if (!user) {
        if (active) {
          setError("Please login to load financial portfolio.");
          setLoading(false);
        }
        return;
      }

      try {
        const ref = doc(db, "financial_portfolios", user.uid);
        const snap = await getDoc(ref);

        if (!active) return;

        if (snap.exists()) {
          const data = snap.data();
          const savedHoldings = Array.isArray(data.holdings) ? data.holdings : [];

          if (savedHoldings.length) {
            setHoldings(
              savedHoldings.map((item) => ({
                symbol: String(item.symbol || "").toUpperCase(),
                name: String(item.name || ""),
                type: String(item.type || "Stock"),
                qty: Number(item.qty || 0),
                avgPrice: Number(item.avgPrice || 0),
              }))
            );
          }
        }
      } catch {
        if (active) {
          setError("Could not load saved portfolio from Firebase.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadPortfolio();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!holdings.length) return;

    let active = true;
    const fetchQuotes = async () => {
      try {
        const symbols = holdings
          .map((item) => item.symbol)
          .filter(Boolean)
          .join(",");

        if (!symbols) return;

        const response = await fetch(`/api/finance/quotes?symbols=${symbols}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Failed to fetch quotes");
        }

        const data = await response.json();
        if (!active) return;

        setQuoteMap(data.quotes || {});
        setAsOf(data.asOf || "");
        setError(data.note || "");
      } catch {
        if (active) {
          setError("Unable to load live prices right now.");
        }
      }
    };

    fetchQuotes();
    const interval = setInterval(fetchQuotes, 30000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [holdings]);

  const rows = useMemo(() => {
    return holdings.map((item) => {
      const quote = quoteMap[item.symbol] || {};
      const currentPrice = Number(quote.price || item.avgPrice);
      const invested = item.qty * item.avgPrice;
      const marketValue = item.qty * currentPrice;
      const pnl = marketValue - invested;

      return {
        ...item,
        currentPrice,
        invested,
        marketValue,
        pnl,
        change: Number(quote.change || 0),
      };
    });
  }, [holdings, quoteMap]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.invested += row.invested;
        acc.value += row.marketValue;
        return acc;
      },
      { invested: 0, value: 0 }
    );
  }, [rows]);

  const totalPnl = totals.value - totals.invested;

  const updateHolding = (index, key, value) => {
    setHoldings((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        if (key === "qty" || key === "avgPrice") {
          return { ...item, [key]: Number(value || 0) };
        }
        if (key === "symbol") {
          return { ...item, symbol: value.toUpperCase() };
        }
        return { ...item, [key]: value };
      })
    );
  };

  const addHolding = () => {
    setHoldings((prev) => [
      ...prev,
      { symbol: "", name: "", type: "Stock", qty: 0, avgPrice: 0 },
    ]);
  };

  const removeHolding = (index) => {
    setHoldings((prev) => prev.filter((_, i) => i !== index));
  };

  const savePortfolio = async () => {
    const user = getCurrentUser();
    if (!user) {
      setSaveMessage("Please login first.");
      return;
    }

    try {
      const cleaned = holdings
        .filter((item) => item.symbol)
        .map((item) => ({
          symbol: item.symbol.toUpperCase(),
          name: item.name,
          type: item.type,
          qty: Number(item.qty || 0),
          avgPrice: Number(item.avgPrice || 0),
        }));

      await setDoc(
        doc(db, "financial_portfolios", user.uid),
        {
          userId: user.uid,
          holdings: cleaned,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setSaveMessage("Portfolio saved in Firebase.");
    } catch {
      setSaveMessage("Failed to save portfolio.");
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.headerCard}>
        <h1>My Financials Dashboard</h1>
        <p>Track your stocks, ETFs, invested amount, quantity, current rate and live P/L.</p>
        <div className={styles.metaRow}>
          <span>{loading ? "Loading portfolio..." : "Live market snapshot"}</span>
          {asOf && <span>Updated: {new Date(asOf).toLocaleTimeString()}</span>}
        </div>
        {error && <p className={styles.warning}>{error}</p>}
      </section>

      <section className={styles.actionsRow}>
        <button className={styles.actionBtn} onClick={addHolding}>+ Add Holding</button>
        <button className={styles.actionBtn} onClick={savePortfolio}>Save to Firebase</button>
        {saveMessage && <span className={styles.saveMsg}>{saveMessage}</span>}
      </section>

      <section className={styles.kpiGrid}>
        <article className={styles.kpiCard}>
          <h3>Total Invested</h3>
          <strong>${totals.invested.toFixed(2)}</strong>
        </article>
        <article className={styles.kpiCard}>
          <h3>Current Value</h3>
          <strong>${totals.value.toFixed(2)}</strong>
        </article>
        <article className={styles.kpiCard}>
          <h3>Net P/L</h3>
          <strong className={totalPnl >= 0 ? styles.positive : styles.negative}>
            ${totalPnl.toFixed(2)}
          </strong>
        </article>
      </section>

      <section className={styles.contentGrid}>
        <article className={styles.panel}>
          <h2>Holdings (Editable)</h2>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Qty</th>
                  <th>Avg Price</th>
                  <th>Current</th>
                  <th>Invested</th>
                  <th>Value</th>
                  <th>P/L</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={`${row.symbol}-${idx}`}>
                    <td>
                      <input value={row.symbol} onChange={(e) => updateHolding(idx, "symbol", e.target.value)} />
                    </td>
                    <td>
                      <input value={row.name} onChange={(e) => updateHolding(idx, "name", e.target.value)} />
                    </td>
                    <td>
                      <select value={row.type} onChange={(e) => updateHolding(idx, "type", e.target.value)}>
                        <option>Stock</option>
                        <option>ETF</option>
                        <option>Crypto</option>
                      </select>
                    </td>
                    <td>
                      <input type="number" value={row.qty} onChange={(e) => updateHolding(idx, "qty", e.target.value)} />
                    </td>
                    <td>
                      <input type="number" value={row.avgPrice} onChange={(e) => updateHolding(idx, "avgPrice", e.target.value)} />
                    </td>
                    <td>
                      ${row.currentPrice.toFixed(2)}
                      <span className={row.change >= 0 ? styles.positive : styles.negative}>
                        {row.change >= 0 ? " ▲" : " ▼"}
                        {Math.abs(row.change).toFixed(2)}%
                      </span>
                    </td>
                    <td>${row.invested.toFixed(2)}</td>
                    <td>${row.marketValue.toFixed(2)}</td>
                    <td className={row.pnl >= 0 ? styles.positive : styles.negative}>${row.pnl.toFixed(2)}</td>
                    <td>
                      <button className={styles.removeBtn} onClick={() => removeHolding(idx)}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className={styles.panel}>
          <h2>Portfolio Allocation (Value)</h2>
          <MiniBarChart rows={rows} />
        </article>
      </section>
    </main>
  );
}
