"use client";

import { useEffect, useMemo, useState } from "react";
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

// ─── Charge fields per action ─────────────────────────────
//  BUY  : Brokerage, Exchange Transaction Charges, GST, Stamp Duty
//  SELL : Groww DP Charges, Brokerage, Exchange Transaction Charges,
//         STT (Securities Transaction Tax), CDSL DP Charges, GST
//
//  NOTE: Groww DP Charges (₹16.50 flat/scrip/day) is Groww's own
//        depository participant fee shown above the "Charges" section.
//        CDSL DP Charges (₹3.50) is the actual CDSL depository charge.
//        Both apply only on SELL.
const CHARGE_FIELDS = {
  BUY: [
    { key: "brokerage",        label: "Brokerage" },
    { key: "exchangeCharges",  label: "Exch. Transaction Charges" },
    { key: "gst",              label: "GST" },
    { key: "stampDuty",        label: "Stamp Duty" },
  ],
  SELL: [
    { key: "growwDpCharges",   label: "Groww DP Charges" },
    { key: "brokerage",        label: "Brokerage" },
    { key: "exchangeCharges",  label: "Exch. Transaction Charges" },
    { key: "stt",              label: "STT (Securities Transaction Tax)" },
    { key: "cdslDpCharges",    label: "CDSL DP Charges" },
    { key: "gst",              label: "GST" },
  ],
};

// All possible charge keys (union of BUY + SELL)
const ALL_CHARGE_KEYS = [
  "brokerage", "exchangeCharges", "gst", "stampDuty",
  "stt", "cdslDpCharges", "growwDpCharges",
];

const EMPTY_FORM = {
  symbol: "",
  companyName: "",
  stockType: "Equity",
  qty: "",
  price: "",
  action: "BUY",
  date: "",
  // charges (all default "")
  brokerage: "",
  exchangeCharges: "",
  gst: "",
  stampDuty: "",
  stt: "",
  cdslDpCharges: "",
  growwDpCharges: "",
  id: null,
};

// Sum only the charge keys relevant to a given action
const sumChargesForAction = (t, action) =>
  CHARGE_FIELDS[action].reduce((s, f) => s + Number(t[f.key] || 0), 0);

// Sum all stored charges regardless of action (for totals)
const sumAllCharges = (t) =>
  ALL_CHARGE_KEYS.reduce((s, k) => s + Number(t[k] || 0), 0);

export default function FinancialsPage() {
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);

  const router = useRouter();

  // ---------------- FETCH ----------------
  useEffect(() => {
    const currentUser = getCurrentUser();
    if (currentUser) {
      setUser(currentUser);
      fetchData(currentUser.uid);
    }
    setLoading(false);
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

  // ---------------- COMPANY SUGGEST ----------------
  const companyList = useMemo(() => {
    const map = {};
    transactions.forEach((t) => { map[t.symbol] = t.companyName; });
    return map;
  }, [transactions]);

  // ---------------- FIFO ENGINE ----------------
  const holdings = useMemo(() => {
    const map = {};
    transactions.forEach((tx) => {
      const qty   = Number(tx.qty);
      const price = Number(tx.price);
      const charges = sumAllCharges(tx);

      if (!map[tx.symbol]) {
        map[tx.symbol] = {
          companyName: tx.companyName,
          lots: [],
          qty: 0,
          invested: 0,
          realized: 0,
          totalCharges: 0,
        };
      }
      const stock = map[tx.symbol];
      stock.totalCharges += charges;

      if (tx.action === "BUY") {
        stock.lots.push({ qty, price });
        stock.qty     += qty;
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

  // ---------------- KPI ----------------
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

  const totalInvest =
    transactions
      .filter((t) => t.action === "BUY")
      .reduce((s, t) => s + Number(t.qty) * Number(t.price), 0) || 0;

  const totalChargesAll = transactions.reduce((s, t) => s + sumAllCharges(t), 0);
  const netPL = totals.totalPL - totalChargesAll;

  // Live form charges total (only fields visible for current action)
  const formChargesTotal = CHARGE_FIELDS[form.action]
    .reduce((s, f) => s + Number(form[f.key] || 0), 0);

  // ---------------- SAVE TRADE ----------------
  const saveTrade = async (e) => {
    e.preventDefault();
    const symbol = form.symbol.toUpperCase();
    const qty    = Number(form.qty);
    const price  = Number(form.price);

    if (form.action === "SELL") {
      const h = holdings.find((h) => h.symbol === symbol);
      if (!h || qty > h.qty) { alert("Not enough stock to sell!"); return; }
    }

    // Build charge payload — zero out fields not applicable to this action
    const chargePayload = {};
    ALL_CHARGE_KEYS.forEach((k) => {
      const relevant = CHARGE_FIELDS[form.action].some((f) => f.key === k);
      chargePayload[k] = relevant ? Number(form[k] || 0) : 0;
    });

    const payload = {
      symbol,
      companyName: form.companyName,
      stockType:   form.stockType,
      qty,
      price,
      action: form.action,
      ...chargePayload,
      createdAt: form.date ? new Date(form.date) : serverTimestamp(),
    };

    if (form.id) {
      await updateDoc(doc(db, "transactions", form.id), payload);
    } else {
      await addDoc(collection(db, "transactions"), { userId: user.uid, ...payload });
    }

    setForm(EMPTY_FORM);
    fetchData(user.uid);
    if (user) await logToolUsage({
      userId: user.uid,
      tool: form.id ? "My Financials - Edit Trade" : "My Financials - Add Trade",
    });
  };

  // ---------------- DELETE ----------------
  const deleteTrade = async (id) => {
    if (!window.confirm("Delete this trade?")) return;
    await deleteDoc(doc(db, "transactions", id));
    fetchData(user.uid);
    if (user) await logToolUsage({ userId: user.uid, tool: "My Financials - Delete Trade" });
  };

  // ---------------- EDIT ----------------
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
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const formatDate = (createdAt) => {
    const d = new Date(createdAt?.seconds ? createdAt.seconds * 1000 : createdAt);
    return d.toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  const fmt = (val) =>
    Number(val) > 0
      ? `₹${Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
      : null;

  if (loading) return <div className={styles.loader}>Loading portfolio…</div>;

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

      {/* ── FORM ── */}
      <div className={styles.formCard}>
        <h3 className={styles.formTitle}>
          {form.id ? "✏️ Edit Trade" : "➕ Add Trade"}
        </h3>
        <form onSubmit={saveTrade} className={styles.addForm}>

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
              <input type="number" placeholder="0" value={form.qty}
                onChange={(e) => setForm({ ...form, qty: e.target.value })} required />
            </div>

            <div className={styles.formGroup}>
              <label>Price (₹)</label>
              <input type="number" placeholder="0.00" value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })} required />
            </div>

            <div className={styles.formGroup}>
              <label>Date &amp; Time</label>
              <input type="datetime-local" value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
          </div>

          {/* Row 2: Charges — dynamic based on BUY / SELL */}
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
                  type="number"
                  placeholder="0.00"
                
                  value={form[field.key]}
                  onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                />
              </div>
            ))}

            {/* Live charges preview */}
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
            {form.id && (
              <button type="button" className={styles.cancelBtn} onClick={() => setForm(EMPTY_FORM)}>
                Cancel
              </button>
            )}
            <button type="submit" className={styles.submitBtn}>
              {form.id ? "Update Trade" : "Add Trade"}
            </button>
          </div>
        </form>
      </div>

      {/* ── TRANSACTION TABLE ── */}
      <div className={styles.tableWrapper}>
        <div className={styles.tableHeader}>
          <h3>Transaction History</h3>
        </div>
        <div className={styles.scrollTable}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th></th>
                <th>Company</th>
                <th>Symbol</th>
                <th>Type</th>
                <th>Action</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Trade Value</th>
                {/* BUY-only */}
                <th className={styles.thBuy}>Brokerage</th>
                <th className={styles.thBuy}>Exch. Charges</th>
                <th className={styles.thBuy}>GST</th>
                <th className={styles.thBuy}>Stamp Duty</th>
                {/* SELL-only */}
                <th className={styles.thSell}>STT</th>
                <th className={styles.thSell}>CDSL DP</th>
                <th className={styles.thSell}>Groww DP</th>
                {/* Common total */}
                <th className={styles.thCharges}>Total Charges</th>
                <th className={styles.thFinal}>Net Amount</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t, i) => {
                const charges    = sumAllCharges(t);
                const tradeValue = Number(t.qty) * Number(t.price);
                // BUY: you pay tradeValue + charges; SELL: you receive tradeValue - charges
                const netAmount  = t.action === "BUY"
                  ? tradeValue + charges
                  : tradeValue - charges;
                const isBuy = t.action === "BUY";

                return (
                  <tr key={i}>
                    <td>{isBuy ? "🟢" : "🔴"}</td>
                    <td>{t.companyName}</td>
                    <td className={styles.monoCell}>{t.symbol}</td>
                    <td>{t.stockType}</td>
                    <td>
                      <span className={isBuy ? styles.badgeBuy : styles.badgeSell}>
                        {t.action}
                      </span>
                    </td>
                    <td className={styles.monoCell}>{t.qty}</td>
                    <td className={styles.monoCell}>
                      ₹{Number(t.price).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td className={styles.monoCell}>
                      ₹{tradeValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>

                    {/* BUY-only cols */}
                    <td className={`${styles.monoCell} ${styles.buyCol}`}>
                      {isBuy ? (fmt(t.brokerage) || <span className={styles.nilCell}>—</span>) : <span className={styles.naCell}>N/A</span>}
                    </td>
                    <td className={`${styles.monoCell} ${styles.buyCol}`}>
                      {isBuy ? (fmt(t.exchangeCharges) || <span className={styles.nilCell}>—</span>) : <span className={styles.naCell}>N/A</span>}
                    </td>
                    <td className={`${styles.monoCell} ${styles.buyCol}`}>
                      {isBuy ? (fmt(t.gst) || <span className={styles.nilCell}>—</span>) : <span className={styles.naCell}>N/A</span>}
                    </td>
                    <td className={`${styles.monoCell} ${styles.buyCol}`}>
                      {isBuy ? (fmt(t.stampDuty) || <span className={styles.nilCell}>—</span>) : <span className={styles.naCell}>N/A</span>}
                    </td>

                    {/* SELL-only cols */}
                    <td className={`${styles.monoCell} ${styles.sellCol}`}>
                      {!isBuy ? (fmt(t.stt) || <span className={styles.nilCell}>—</span>) : <span className={styles.naCell}>N/A</span>}
                    </td>
                    <td className={`${styles.monoCell} ${styles.sellCol}`}>
                      {!isBuy ? (fmt(t.cdslDpCharges) || <span className={styles.nilCell}>—</span>) : <span className={styles.naCell}>N/A</span>}
                    </td>
                    <td className={`${styles.monoCell} ${styles.sellCol}`}>
                      {!isBuy ? (fmt(t.growwDpCharges) || <span className={styles.nilCell}>—</span>) : <span className={styles.naCell}>N/A</span>}
                    </td>

                    {/* Totals */}
                    <td className={`${styles.monoCell} ${styles.chargesCell}`}>
                      {charges > 0
                        ? `₹${charges.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                        : <span className={styles.nilCell}>—</span>}
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
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={19} className={styles.emptyRow}>
                    No transactions yet. Add your first trade above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
