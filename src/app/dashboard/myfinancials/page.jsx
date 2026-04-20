"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { logToolUsage } from "@/lib/firestore";
import {
  collection,
  getDocs,
  query,
  where,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getCurrentUser } from "@/lib/firebaseAuth";
import styles from "./myfinancials.module.css";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Filler,
} from "chart.js";
import { Doughnut, Bar, Line } from "react-chartjs-2";

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Filler
);

// ─── Charge fields per action ─────────────────────────────
const CHARGE_FIELDS = {
  BUY: [
    { key: "brokerage",       label: "Brokerage" },
    { key: "exchangeCharges", label: "Exch. Transaction Charges" },
    { key: "gst",             label: "GST" },
    { key: "stampDuty",       label: "Stamp Duty" },
  ],
  SELL: [
    { key: "growwDpCharges",  label: "Groww DP Charges" },
    { key: "brokerage",       label: "Brokerage" },
    { key: "exchangeCharges", label: "Exch. Transaction Charges" },
    { key: "stt",             label: "STT (Securities Transaction Tax)" },
    { key: "cdslDpCharges",   label: "CDSL DP Charges" },
    { key: "gst",             label: "GST" },
  ],
};

const ALL_CHARGE_KEYS = [
  "brokerage", "exchangeCharges", "gst", "stampDuty",
  "stt", "cdslDpCharges", "growwDpCharges",
];

const EMPTY_FORM = {
  symbol: "", companyName: "", stockType: "Equity",
  qty: "", price: "", action: "BUY", date: "",
  brokerage: "", exchangeCharges: "", gst: "", stampDuty: "",
  stt: "", cdslDpCharges: "", growwDpCharges: "",
  id: null,
};

const sumAllCharges = (t) =>
  ALL_CHARGE_KEYS.reduce((s, k) => s + Number(t[k] || 0), 0);

const CHART_COLORS = [
  "#4361ee", "#0f9d6e", "#f77f00", "#e63946",
  "#3a86ff", "#9b5de5", "#f15bb5", "#00bbf9", "#06d6a0",
];

export default function FinancialsPage() {
  const [user, setUser]               = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [modalOpen, setModalOpen]     = useState(false);
  const [formError, setFormError]     = useState("");
  const modalRef                      = useRef(null);
  const router                        = useRouter();

  // ── fetch ──────────────────────────────────────────────
  useEffect(() => {
    const currentUser = getCurrentUser();
    if (currentUser) { setUser(currentUser); fetchData(currentUser.uid); }
    setLoading(false);
  }, []);

  // close modal on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") closeModal(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const fetchData = async (uid) => {
    const q = query(
      collection(db, "transactions"),
      where("userId", "==", uid),
      orderBy("createdAt", "asc"),
    );
    const snap = await getDocs(q);
    setTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  };

  // ── company suggest ────────────────────────────────────
  const companyList = useMemo(() => {
    const map = {};
    transactions.forEach((t) => { map[t.symbol] = t.companyName; });
    return map;
  }, [transactions]);

  // ── FIFO engine ────────────────────────────────────────
  const holdings = useMemo(() => {
    const map = {};
    transactions.forEach((tx) => {
      const qty     = Number(tx.qty);
      const price   = Number(tx.price);
      const charges = sumAllCharges(tx);
      if (!map[tx.symbol]) {
        map[tx.symbol] = {
          companyName: tx.companyName, lots: [],
          qty: 0, invested: 0, realized: 0, totalCharges: 0,
        };
      }
      const stock = map[tx.symbol];
      stock.totalCharges += charges;
      if (tx.action === "BUY") {
        stock.lots.push({ qty, price });
        stock.qty      += qty;
        stock.invested += qty * price;
      }
      if (tx.action === "SELL") {
        let remaining = qty;
        while (remaining > 0 && stock.lots.length > 0) {
          const lot = stock.lots[0];
          if (lot.qty <= remaining) {
            stock.realized  += lot.qty * (price - lot.price);
            stock.invested  -= lot.qty * lot.price;
            remaining       -= lot.qty;
            stock.qty       -= lot.qty;
            stock.lots.shift();
          } else {
            stock.realized  += remaining * (price - lot.price);
            stock.invested  -= remaining * lot.price;
            lot.qty         -= remaining;
            stock.qty       -= remaining;
            remaining = 0;
          }
        }
      }
    });
    return Object.entries(map).map(([symbol, data]) => ({ symbol, ...data }));
  }, [transactions]);

  // ── KPI ───────────────────────────────────────────────
  const totals = useMemo(() =>
    holdings.reduce(
      (acc, h) => {
        if (h.qty > 0) { acc.currentInvest += h.invested; acc.totalStocks += 1; }
        acc.totalPL      += h.realized;
        acc.totalCharges += h.totalCharges;
        return acc;
      },
      { currentInvest: 0, totalPL: 0, totalStocks: 0, totalCharges: 0 },
    ),
  [holdings]);

  const totalInvest = transactions
    .filter((t) => t.action === "BUY")
    .reduce((s, t) => s + Number(t.qty) * Number(t.price), 0) || 0;

  const totalChargesAll = transactions.reduce((s, t) => s + sumAllCharges(t), 0);
  const netPL = totals.totalPL - totalChargesAll;

  const formChargesTotal = CHARGE_FIELDS[form.action]
    .reduce((s, f) => s + Number(form[f.key] || 0), 0);

  // ── Modal helpers ──────────────────────────────────────
  const openModal = () => { setFormError(""); setModalOpen(true); };

  const closeModal = () => {
    setModalOpen(false);
    setForm(EMPTY_FORM);
    setFormError("");
  };

  const onOverlayClick = (e) => {
    if (modalRef.current && !modalRef.current.contains(e.target)) closeModal();
  };

  // ── Save trade ─────────────────────────────────────────
  const saveTrade = async (e) => {
    e.preventDefault();
    setFormError("");
    const symbol = form.symbol.toUpperCase();
    const qty    = Number(form.qty);
    const price  = Number(form.price);

    if (form.action === "SELL") {
      const h = holdings.find((h) => h.symbol === symbol);
      if (!h || qty > h.qty) {
        setFormError("Not enough stock to sell!");
        return;
      }
    }

    const chargePayload = {};
    ALL_CHARGE_KEYS.forEach((k) => {
      const relevant = CHARGE_FIELDS[form.action].some((f) => f.key === k);
      chargePayload[k] = relevant ? Number(form[k] || 0) : 0;
    });

    const payload = {
      symbol,
      companyName: form.companyName,
      stockType:   form.stockType,
      qty, price,
      action: form.action,
      ...chargePayload,
      createdAt: form.date ? new Date(form.date) : serverTimestamp(),
    };

    if (form.id) {
      await updateDoc(doc(db, "transactions", form.id), payload);
    } else {
      await addDoc(collection(db, "transactions"), { userId: user.uid, ...payload });
    }

    closeModal();
    fetchData(user.uid);
    if (user) await logToolUsage({
      userId: user.uid,
      tool: form.id ? "My Financials - Edit Trade" : "My Financials - Add Trade",
    });
  };

  // ── Delete ─────────────────────────────────────────────
  const deleteTrade = async (id) => {
    if (!window.confirm("Delete this trade?")) return;
    await deleteDoc(doc(db, "transactions", id));
    fetchData(user.uid);
    if (user) await logToolUsage({ userId: user.uid, tool: "My Financials - Delete Trade" });
  };

  // ── Edit ───────────────────────────────────────────────
  const editTrade = (t) => {
    setForm({
      symbol:          t.symbol,
      companyName:     t.companyName,
      stockType:       t.stockType,
      qty:             t.qty,
      price:           t.price,
      action:          t.action,
      brokerage:       t.brokerage       || "",
      exchangeCharges: t.exchangeCharges || "",
      gst:             t.gst             || "",
      stampDuty:       t.stampDuty       || "",
      stt:             t.stt             || "",
      cdslDpCharges:   t.cdslDpCharges   || "",
      growwDpCharges:  t.growwDpCharges  || "",
      date: t.createdAt?.seconds
        ? new Date(t.createdAt.seconds * 1000).toISOString().slice(0, 16)
        : t.createdAt,
      id: t.id,
    });
    setFormError("");
    openModal();
  };

  const formatDate = (createdAt) => {
    const d = new Date(createdAt?.seconds ? createdAt.seconds * 1000 : createdAt);
    return d.toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  const fmtVal = (val) =>
    Number(val) > 0
      ? `₹${Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
      : null;

  // ── Chart data ─────────────────────────────────────────
  const activeHoldings = holdings.filter((h) => h.qty > 0);

  const allocChartData = {
    labels: activeHoldings.map((h) => h.symbol),
    datasets: [{
      data: activeHoldings.map((h) => h.invested),
      backgroundColor: CHART_COLORS.slice(0, activeHoldings.length),
      borderWidth: 2,
      borderColor: "#fff",
    }],
  };

  const plHoldings = holdings.filter((h) => Math.abs(h.realized) > 0);
  const plChartData = {
    labels: plHoldings.map((h) => h.symbol),
    datasets: [{
      label: "Realized P&L",
      data: plHoldings.map((h) => h.realized),
      backgroundColor: plHoldings.map((h) =>
        h.realized >= 0 ? "rgba(15,157,110,0.75)" : "rgba(230,57,70,0.75)"
      ),
      borderRadius: 6,
    }],
  };

  const byMonth = {};
  transactions.forEach((t) => {
    const d = new Date(t.createdAt?.seconds ? t.createdAt.seconds * 1000 : t.createdAt);
    const key = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
    if (!byMonth[key]) byMonth[key] = { buy: 0, sell: 0 };
    const val = Number(t.qty) * Number(t.price);
    if (t.action === "BUY") byMonth[key].buy += val;
    else byMonth[key].sell += val;
  });
  const timelineData = {
    labels: Object.keys(byMonth),
    datasets: [
      {
        label: "Buy",
        data: Object.values(byMonth).map((m) => m.buy),
        borderColor: "#0f9d6e",
        backgroundColor: "rgba(15,157,110,0.08)",
        fill: true, tension: 0.4, borderWidth: 2,
        pointRadius: 4, pointBackgroundColor: "#0f9d6e",
      },
      {
        label: "Sell",
        data: Object.values(byMonth).map((m) => m.sell),
        borderColor: "#e63946",
        backgroundColor: "rgba(230,57,70,0.08)",
        fill: true, tension: 0.4, borderWidth: 2,
        pointRadius: 4, pointBackgroundColor: "#e63946",
      },
    ],
  };

  const chargeKeys   = ["brokerage","exchangeCharges","gst","stampDuty","stt","cdslDpCharges","growwDpCharges"];
  const chargeLabels = ["Brokerage","Exch. Charges","GST","Stamp Duty","STT","CDSL DP","Groww DP"];
  const chargeTotals = chargeKeys.map((k) =>
    transactions.reduce((s, t) => s + Number(t[k] || 0), 0)
  );
  const chargeFiltered = chargeKeys
    .map((k, i) => ({ label: chargeLabels[i], val: chargeTotals[i], color: CHART_COLORS[i] }))
    .filter((c) => c.val > 0);

  const chargesChartData = {
    labels: chargeFiltered.map((c) => c.label),
    datasets: [{
      data: chargeFiltered.map((c) => c.val),
      backgroundColor: chargeFiltered.map((c) => c.color),
      borderWidth: 2, borderColor: "#fff",
    }],
  };

  const buyTotal  = transactions.filter((t) => t.action === "BUY").reduce((s, t) => s + Number(t.qty) * Number(t.price), 0);
  const sellTotal = transactions.filter((t) => t.action === "SELL").reduce((s, t) => s + Number(t.qty) * Number(t.price), 0);
  const bsvData = {
    labels: ["Buy Volume", "Sell Volume"],
    datasets: [{
      data: [buyTotal, sellTotal],
      backgroundColor: ["rgba(15,157,110,0.75)", "rgba(230,57,70,0.75)"],
      borderRadius: 8,
    }],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
  };

  const barOptions = {
    ...chartOptions,
    scales: {
      y: { ticks: { callback: (v) => "₹" + Math.round(v) }, grid: { color: "rgba(99,120,200,0.07)" } },
      x: { grid: { display: false } },
    },
  };

  const lineOptions = {
    ...chartOptions,
    scales: {
      y: { ticks: { callback: (v) => "₹" + Math.round(v) }, grid: { color: "rgba(99,120,200,0.07)" } },
      x: { grid: { display: false } },
    },
  };

  if (loading) return <div className={styles.loader}>Loading portfolio…</div>;

  const maxInvested = Math.max(...activeHoldings.map((h) => h.invested), 1);

  return (
    <div className={styles.container}>
      <button className={styles.backBtn} onClick={() => router.back()}>← Back</button>
      <h1 className={styles.pageTitle}>📈 Portfolio Manager</h1>

      {/* ── KPI CARDS ── */}
      <div className={styles.kpiGrid}>
        <div className={styles.card}>
          <span>Total Invested</span>
          <h2>₹{totalInvest.toLocaleString("en-IN")}</h2>
        </div>
        <div className={styles.card}>
          <span>Current Value</span>
          <h2>₹{totals.currentInvest.toLocaleString("en-IN")}</h2>
        </div>
        <div className={`${styles.card} ${totals.totalPL >= 0 ? styles.cardPositive : styles.cardNegative}`}>
          <span>Realised P&amp;L</span>
          <h2 style={{ color: totals.totalPL >= 0 ? "var(--buy)" : "var(--sell)" }}>
            {totals.totalPL >= 0 ? "+" : ""}₹{totals.totalPL.toLocaleString("en-IN")}
          </h2>
        </div>
        <div className={`${styles.card} ${styles.cardCharges}`}>
          <span>Total Charges</span>
          <h2 style={{ color: "var(--charges)" }}>
            −₹{totalChargesAll.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </h2>
        </div>
        <div className={`${styles.card} ${netPL >= 0 ? styles.cardPositive : styles.cardNegative}`}>
          <span>Net P&amp;L (after charges)</span>
          <h2 style={{ color: netPL >= 0 ? "var(--buy)" : "var(--sell)" }}>
            {netPL >= 0 ? "+" : ""}₹{netPL.toLocaleString("en-IN")}
          </h2>
        </div>
        <div className={styles.card}>
          <span>Active Positions</span>
          <h2>{totals.totalStocks}</h2>
        </div>
      </div>

      {/* ── ADD TRADE BUTTON ── */}
      <button className={styles.addTradeBtn} onClick={openModal}>
        ➕ Add Trade
      </button>

      {/* ── ANALYTICS SECTION ── */}
      <div className={styles.sectionHeader}>
        <span>📊 Analytics Dashboard</span>
      </div>

      <div className={styles.chartsGrid}>
        {/* Allocation */}
        <div className={styles.chartCard}>
          <div className={styles.chartTitle}>Portfolio Allocation</div>
          {activeHoldings.length > 0 ? (
            <>
              <div className={styles.chartWrap}>
                <Doughnut data={allocChartData} options={chartOptions} />
              </div>
              <div className={styles.chartLegend}>
                {activeHoldings.map((h, i) => (
                  <span key={h.symbol} className={styles.legendItem}>
                    <span className={styles.legendDot} style={{ background: CHART_COLORS[i] }} />
                    {h.symbol}
                  </span>
                ))}
              </div>
            </>
          ) : <div className={styles.chartEmpty}>No active holdings</div>}
        </div>

        {/* P&L */}
        <div className={styles.chartCard}>
          <div className={styles.chartTitle}>Realized P&amp;L by Stock</div>
          {plHoldings.length > 0 ? (
            <div className={styles.chartWrap}>
              <Bar data={plChartData} options={barOptions} />
            </div>
          ) : <div className={styles.chartEmpty}>No realized P&L yet</div>}
        </div>

        {/* Timeline */}
        <div className={`${styles.chartCard} ${styles.chartCardWide}`}>
          <div className={styles.chartTitle}>Trade Activity Timeline</div>
          {Object.keys(byMonth).length > 0 ? (
            <>
              <div className={`${styles.chartWrap} ${styles.chartWrapLg}`}>
                <Line data={timelineData} options={lineOptions} />
              </div>
              <div className={styles.chartLegend}>
                <span className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: "#0f9d6e" }} />Buy Value
                </span>
                <span className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: "#e63946" }} />Sell Value
                </span>
              </div>
            </>
          ) : <div className={styles.chartEmpty}>No trades yet</div>}
        </div>

        {/* Charges Breakdown */}
        <div className={styles.chartCard}>
          <div className={styles.chartTitle}>Charges Breakdown</div>
          {chargeFiltered.length > 0 ? (
            <>
              <div className={styles.chartWrap}>
                <Doughnut data={chargesChartData} options={chartOptions} />
              </div>
              <div className={styles.chartLegend}>
                {chargeFiltered.map((c) => (
                  <span key={c.label} className={styles.legendItem}>
                    <span className={styles.legendDot} style={{ background: c.color }} />
                    {c.label}
                  </span>
                ))}
              </div>
            </>
          ) : <div className={styles.chartEmpty}>No charges recorded</div>}
        </div>

        {/* Buy vs Sell */}
        <div className={styles.chartCard}>
          <div className={styles.chartTitle}>Buy vs Sell Volume</div>
          <div className={styles.chartWrap}>
            <Bar data={bsvData} options={barOptions} />
          </div>
          <div className={styles.chartLegend}>
            <span className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: "#0f9d6e" }} />Buy
            </span>
            <span className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: "#e63946" }} />Sell
            </span>
          </div>
        </div>
      </div>

      {/* ── ACTIVE HOLDINGS CARDS ── */}
      {activeHoldings.length > 0 && (
        <>
          <div className={styles.sectionHeader}>
            <span>📂 Active Holdings</span>
          </div>
          <div className={styles.holdingsGrid}>
            {activeHoldings.map((h) => {
              const avgPrice = h.qty > 0 ? h.invested / h.qty : 0;
              const barWidth = Math.min(100, (h.invested / maxInvested) * 100);
              return (
                <div key={h.symbol} className={styles.holdingCard}>
                  <div className={styles.holdingSymbol}>{h.symbol}</div>
                  <div className={styles.holdingName}>{h.companyName}</div>
                  <div className={styles.holdingMeta}>
                    <div className={styles.holdingLeft}>
                      <div className={styles.holdingQtyLabel}>Qty</div>
                      <div className={styles.holdingQtyVal}>{h.qty}</div>
                      <div className={styles.holdingAvg}>
                        Avg ₹{avgPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className={`${styles.holdingPL} ${h.realized >= 0 ? styles.holdingPLPos : styles.holdingPLNeg}`}>
                      {h.realized >= 0 ? "+" : ""}₹{h.realized.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      <div className={styles.holdingPLLabel}>Realized P&L</div>
                    </div>
                  </div>
                  <div className={styles.holdingInvested}>
                    Invested: ₹{h.invested.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                  <div className={styles.holdingBar}>
                    <div className={styles.holdingBarFill} style={{ width: `${barWidth}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── TRANSACTIONS TABLE ── */}
      <TableSection
        transactions={transactions}
        holdings={holdings}
        editTrade={editTrade}
        deleteTrade={deleteTrade}
        formatDate={formatDate}
        fmtVal={fmtVal}
        sumAllCharges={sumAllCharges}
      />

      {/* ── MODAL ── */}
      {modalOpen && (
        <div className={styles.modalOverlay} onClick={onOverlayClick}>
          <div className={styles.modal} ref={modalRef}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>
                {form.id ? "✏️ Edit Trade" : "➕ Add Trade"}
              </span>
              <button className={styles.modalClose} onClick={closeModal}>✕</button>
            </div>

            {formError && (
              <div className={styles.formAlert}>{formError}</div>
            )}

            <form onSubmit={saveTrade}>
              {/* Row 1: Trade details */}
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Symbol</label>
                  <input
                    list="symbolList"
                    placeholder="e.g. INFY"
                    value={form.symbol}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      setForm({ ...form, symbol: val, companyName: companyList[val] || "" });
                    }}
                    required
                  />
                  <datalist id="symbolList">
                    {Object.keys(companyList).map((s) => <option key={s} value={s} />)}
                  </datalist>
                </div>

                <div className={styles.formGroup}>
                  <label>Company Name</label>
                  <input
                    placeholder="Company Name"
                    value={form.companyName}
                    onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Type</label>
                  <select value={form.stockType} onChange={(e) => setForm({ ...form, stockType: e.target.value })}>
                    <option>Equity</option>
                    <option>ETF</option>
                    <option>Crypto</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label>Action</label>
                  <select
                    value={form.action}
                    onChange={(e) => setForm({ ...form, action: e.target.value })}
                    className={form.action === "BUY" ? styles.selectBuy : styles.selectSell}
                  >
                    <option value="BUY">BUY</option>
                    <option value="SELL">SELL</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label>Quantity</label>
                  <input
                    type="number" placeholder="0" value={form.qty}
                    onChange={(e) => setForm({ ...form, qty: e.target.value })}
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Price (₹)</label>
                  <input
                    type="number" placeholder="0.00" value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Date &amp; Time</label>
                  <input
                    type="datetime-local" value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </div>
              </div>

              {/* Charges divider */}
              <div className={styles.chargesDivider}>
                <span className={form.action === "BUY" ? styles.chargesLabelBuy : styles.chargesLabelSell}>
                  💸 {form.action === "BUY" ? "BUY Charges" : "SELL Charges"} (optional)
                </span>
              </div>

              <div className={styles.chargesHelp}>
                {form.action === "BUY"
                  ? "Applicable: Brokerage · Exchange Transaction Charges · GST · Stamp Duty"
                  : "Applicable: Brokerage · Exchange Transaction Charges · STT · CDSL DP Charges · GST"}
              </div>

              <div className={styles.formRow}>
                {CHARGE_FIELDS[form.action].map((field) => (
                  <div className={styles.formGroup} key={field.key}>
                    <label>{field.label} (₹)</label>
                    <input
                      type="number" placeholder="0.00"
                      value={form[field.key]}
                      onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                    />
                  </div>
                ))}

                {formChargesTotal > 0 && (
                  <div className={styles.chargesPreview}>
                    <span>Total Charges</span>
                    <strong>
                      ₹{formChargesTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                )}
              </div>

              <div className={styles.formActions}>
                <button type="button" className={styles.cancelBtn} onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className={styles.submitBtn}>
                  {form.id ? "Update Trade" : "Add Trade"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TABLE SECTION ─────────────────────────────────────────
function TableSection({ transactions, holdings, editTrade, deleteTrade, formatDate, fmtVal, sumAllCharges }) {
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState("");
  const [sortKey, setSortKey]   = useState("date");
  const [sortDir, setSortDir]   = useState("desc");

  const filtered = useMemo(() => {
    let list = [...transactions];
    if (tab !== "ALL") list = list.filter((t) => t.action === tab);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (t) => t.companyName?.toLowerCase().includes(q) || t.symbol?.toLowerCase().includes(q)
      );
    }
    if (dateFrom) {
      const from = new Date(dateFrom);
      list = list.filter((t) => {
        const d = new Date(t.createdAt?.seconds ? t.createdAt.seconds * 1000 : t.createdAt);
        return d >= from;
      });
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      list = list.filter((t) => {
        const d = new Date(t.createdAt?.seconds ? t.createdAt.seconds * 1000 : t.createdAt);
        return d <= to;
      });
    }
    list.sort((a, b) => {
      let va, vb;
      if (sortKey === "date") {
        va = a.createdAt?.seconds ? a.createdAt.seconds : new Date(a.createdAt).getTime() / 1000;
        vb = b.createdAt?.seconds ? b.createdAt.seconds : new Date(b.createdAt).getTime() / 1000;
      } else if (sortKey === "name")   { va = a.companyName?.toLowerCase(); vb = b.companyName?.toLowerCase(); }
      else if (sortKey === "symbol")   { va = a.symbol?.toLowerCase();      vb = b.symbol?.toLowerCase(); }
      else if (sortKey === "qty")      { va = Number(a.qty);                vb = Number(b.qty); }
      else if (sortKey === "value")    { va = Number(a.qty) * Number(a.price); vb = Number(b.qty) * Number(b.price); }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [transactions, tab, search, dateFrom, dateTo, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sortIcon = (key) => {
    if (sortKey !== key) return <span className={styles.sortNeutral}>⇅</span>;
    return sortDir === "asc"
      ? <span className={styles.sortActive}>↑</span>
      : <span className={styles.sortActive}>↓</span>;
  };

  const exportCSV = () => {
    const headers = [
      "Action","Company","Symbol","Type","Qty","Price","Trade Value",
      "Brokerage","Exch.Charges","GST","Stamp Duty",
      "Groww DP","STT","CDSL DP","Total Charges","Net Amount","Date",
    ];
    const rows = filtered.map((t) => {
      const charges    = sumAllCharges(t);
      const tradeValue = Number(t.qty) * Number(t.price);
      const netAmount  = t.action === "BUY" ? tradeValue + charges : tradeValue - charges;
      const d = new Date(t.createdAt?.seconds ? t.createdAt.seconds * 1000 : t.createdAt);
      return [
        t.action, t.companyName, t.symbol, t.stockType,
        t.qty, t.price, tradeValue.toFixed(2),
        t.brokerage || 0, t.exchangeCharges || 0, t.gst || 0, t.stampDuty || 0,
        t.growwDpCharges || 0, t.stt || 0, t.cdslDpCharges || 0,
        charges.toFixed(2), netAmount.toFixed(2),
        d.toLocaleDateString("en-IN"),
      ];
    });
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `transactions_${tab.toLowerCase()}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={styles.tableWrapper}>
      {/* Top bar */}
      <div className={styles.tableTopBar}>
        <div className={styles.tabGroup}>
          <button
            className={`${styles.tabBtn} ${tab === "ALL" ? styles.tabAll : ""}`}
            onClick={() => setTab("ALL")}
          >
            All <span className={styles.tabCount}>{transactions.length}</span>
          </button>
          <button
            className={`${styles.tabBtn} ${tab === "BUY" ? styles.tabBuyActive : ""}`}
            onClick={() => setTab("BUY")}
          >
            🟢 Buy <span className={styles.tabCount}>{transactions.filter((t) => t.action === "BUY").length}</span>
          </button>
          <button
            className={`${styles.tabBtn} ${tab === "SELL" ? styles.tabSellActive : ""}`}
            onClick={() => setTab("SELL")}
          >
            🔴 Sell <span className={styles.tabCount}>{transactions.filter((t) => t.action === "SELL").length}</span>
          </button>
        </div>
        <button className={styles.exportBtn} onClick={exportCSV}>↓ Export CSV</button>
      </div>

      {/* Filter bar */}
      <div className={styles.filterBar}>
        <div className={styles.filterSearch}>
          <span className={styles.filterIcon}>🔍</span>
          <input
            className={styles.filterInput}
            placeholder="Search company or symbol…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className={styles.filterClear} onClick={() => setSearch("")}>✕</button>
          )}
        </div>
        <div className={styles.filterDateGroup}>
          <label className={styles.filterLabel}>From</label>
          <input type="date" className={styles.filterDate} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className={styles.filterDateGroup}>
          <label className={styles.filterLabel}>To</label>
          <input type="date" className={styles.filterDate} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className={styles.filterSortGroup}>
          <label className={styles.filterLabel}>Sort by</label>
          <select
            className={styles.filterSelect}
            value={sortKey}
            onChange={(e) => { setSortKey(e.target.value); setSortDir("asc"); }}
          >
            <option value="date">Date</option>
            <option value="name">Company Name</option>
            <option value="symbol">Symbol</option>
            <option value="qty">Quantity</option>
            <option value="value">Trade Value</option>
          </select>
          <button
            className={styles.sortDirBtn}
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
          >
            {sortDir === "asc" ? "↑ Asc" : "↓ Desc"}
          </button>
        </div>
        {(search || dateFrom || dateTo) && (
          <button className={styles.clearAllBtn} onClick={() => { setSearch(""); setDateFrom(""); setDateTo(""); }}>
            Clear All
          </button>
        )}
        <span className={styles.resultCount}>{filtered.length} of {transactions.length} records</span>
      </div>

      {/* Table */}
      <div className={styles.scrollTable}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th></th>
              <th onClick={() => toggleSort("name")} className={styles.thSort}>Company {sortIcon("name")}</th>
              <th onClick={() => toggleSort("symbol")} className={styles.thSort}>Symbol {sortIcon("symbol")}</th>
              <th>Type</th>
              {tab === "ALL" && <th>Action</th>}
              <th onClick={() => toggleSort("qty")} className={styles.thSort}>Qty {sortIcon("qty")}</th>
              <th>Price</th>
              <th onClick={() => toggleSort("value")} className={styles.thSort}>Trade Value {sortIcon("value")}</th>
              {(tab === "ALL" || tab === "BUY") && <>
                <th className={styles.thBuy}>Brokerage</th>
                <th className={styles.thBuy}>Exch. Charges</th>
                <th className={styles.thBuy}>GST</th>
                <th className={styles.thBuy}>Stamp Duty</th>
              </>}
              {(tab === "ALL" || tab === "SELL") && <>
                <th className={styles.thSell}>Groww DP</th>
                <th className={styles.thSell}>STT</th>
                <th className={styles.thSell}>CDSL DP</th>
                <th className={styles.thSell}>GST (Sell)</th>
              </>}
              <th className={styles.thCharges}>Total Charges</th>
              <th className={styles.thFinal}>Net Amount</th>
              <th onClick={() => toggleSort("date")} className={styles.thSort}>Date {sortIcon("date")}</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t, i) => {
              const charges    = sumAllCharges(t);
              const tradeValue = Number(t.qty) * Number(t.price);
              const netAmount  = t.action === "BUY" ? tradeValue + charges : tradeValue - charges;
              const isBuy      = t.action === "BUY";
              return (
                <tr key={i}>
                  <td>{isBuy ? "🟢" : "🔴"}</td>
                  <td>{t.companyName}</td>
                  <td className={styles.monoCell}>{t.symbol}</td>
                  <td>{t.stockType}</td>
                  {tab === "ALL" && (
                    <td><span className={isBuy ? styles.badgeBuy : styles.badgeSell}>{t.action}</span></td>
                  )}
                  <td className={styles.monoCell}>{t.qty}</td>
                  <td className={styles.monoCell}>₹{Number(t.price).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  <td className={styles.monoCell}>₹{tradeValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>

                  {(tab === "ALL" || tab === "BUY") && <>
                    <td className={`${styles.monoCell} ${styles.buyCol}`}>{isBuy ? (fmtVal(t.brokerage)       || <span className={styles.nilCell}>—</span>) : <span className={styles.naCell}>N/A</span>}</td>
                    <td className={`${styles.monoCell} ${styles.buyCol}`}>{isBuy ? (fmtVal(t.exchangeCharges) || <span className={styles.nilCell}>—</span>) : <span className={styles.naCell}>N/A</span>}</td>
                    <td className={`${styles.monoCell} ${styles.buyCol}`}>{isBuy ? (fmtVal(t.gst)             || <span className={styles.nilCell}>—</span>) : <span className={styles.naCell}>N/A</span>}</td>
                    <td className={`${styles.monoCell} ${styles.buyCol}`}>{isBuy ? (fmtVal(t.stampDuty)       || <span className={styles.nilCell}>—</span>) : <span className={styles.naCell}>N/A</span>}</td>
                  </>}
                  {(tab === "ALL" || tab === "SELL") && <>
                    <td className={`${styles.monoCell} ${styles.sellCol}`}>{!isBuy ? (fmtVal(t.growwDpCharges) || <span className={styles.nilCell}>—</span>) : <span className={styles.naCell}>N/A</span>}</td>
                    <td className={`${styles.monoCell} ${styles.sellCol}`}>{!isBuy ? (fmtVal(t.stt)            || <span className={styles.nilCell}>—</span>) : <span className={styles.naCell}>N/A</span>}</td>
                    <td className={`${styles.monoCell} ${styles.sellCol}`}>{!isBuy ? (fmtVal(t.cdslDpCharges)  || <span className={styles.nilCell}>—</span>) : <span className={styles.naCell}>N/A</span>}</td>
                    <td className={`${styles.monoCell} ${styles.sellCol}`}>{!isBuy ? (fmtVal(t.gst)            || <span className={styles.nilCell}>—</span>) : <span className={styles.naCell}>N/A</span>}</td>
                  </>}
                  <td className={`${styles.monoCell} ${styles.chargesCell}`}>
                    {charges > 0 ? `₹${charges.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : <span className={styles.nilCell}>—</span>}
                  </td>
                  <td className={`${styles.monoCell} ${styles.finalCell}`}>
                    ₹{netAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                  <td className={styles.dateCell}>{formatDate(t.createdAt)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className={styles.editBtn} onClick={() => editTrade(t)}>Edit</button>
                    <button className={styles.deleteBtn} onClick={() => deleteTrade(t.id)}>Delete</button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={20} className={styles.emptyRow}>
                  {transactions.length === 0
                    ? "No transactions yet. Click 'Add Trade' to get started."
                    : "No records match your filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
