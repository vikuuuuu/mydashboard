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
  serverTimestamp,
  orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getCurrentUser } from "@/lib/firebaseAuth";
import styles from "./myfinancials.module.css";

export default function FinancialsPage() {
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    symbol: "",
    companyName: "",
    stockType: "Equity",
    qty: "",
    price: "",
    action: "BUY",
    date: "",
  });

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
      orderBy("createdAt", "asc")
    );
    const snap = await getDocs(q);
    setTransactions(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
  };

  // ---------------- COMPANY SUGGEST ----------------
  const companyList = useMemo(() => {
    const map = {};
    transactions.forEach((t) => {
      map[t.symbol] = t.companyName;
    });
    return map;
  }, [transactions]);

  // ---------------- FIFO ENGINE ----------------
  const holdings = useMemo(() => {
    const map = {};

    transactions.forEach((tx) => {
      const qty = Number(tx.qty);
      const price = Number(tx.price);

      if (!map[tx.symbol]) {
        map[tx.symbol] = {
          companyName: tx.companyName,
          lots: [],
          qty: 0,
          invested: 0,
          realized: 0,
        };
      }

      const stock = map[tx.symbol];

      if (tx.action === "BUY") {
        stock.lots.push({ qty, price });
        stock.qty += qty;
        stock.invested += qty * price;
      }

      if (tx.action === "SELL") {
        let remaining = qty;

        while (remaining > 0 && stock.lots.length > 0) {
          const firstLot = stock.lots[0];

          if (firstLot.qty <= remaining) {
            stock.realized += firstLot.qty * (price - firstLot.price);
            stock.invested -= firstLot.qty * firstLot.price;
            remaining -= firstLot.qty;
            stock.qty -= firstLot.qty;
            stock.lots.shift();
          } else {
            stock.realized += remaining * (price - firstLot.price);
            stock.invested -= remaining * firstLot.price;
            firstLot.qty -= remaining;
            stock.qty -= remaining;
            remaining = 0;
          }
        }
      }
    });

    return Object.entries(map).map(([symbol, data]) => ({
      symbol,
      ...data,
    }));
  }, [transactions]);

  // ---------------- KPI ----------------
  const totals = useMemo(() => {
    return holdings.reduce(
      (acc, h) => {
        if (h.qty > 0) acc.currentInvest += h.invested;
        acc.totalPL += h.realized;
        if (h.qty > 0) acc.totalStocks += 1;
        return acc;
      },
      { currentInvest: 0, totalPL: 0, totalStocks: 0 }
    );
  }, [holdings]);

  const totalInvest =
    transactions
      .filter((t) => t.action === "BUY")
      .reduce((sum, t) => sum + Number(t.qty) * Number(t.price), 0) || 0;

  // ---------------- ADD TRADE ----------------
  const addTrade = async (e) => {
    e.preventDefault();

    const sellQty = Number(form.qty);
    const symbol = form.symbol.toUpperCase();
    const currentStock = holdings.find((h) => h.symbol === symbol);

    if (form.action === "SELL" && (!currentStock || currentStock.qty < sellQty)) {
      alert("Not enough stock to sell!");
      return;
    }

    await addDoc(collection(db, "transactions"), {
      userId: user.uid,
      symbol,
      companyName: companyList[symbol] || form.companyName,
      stockType: form.stockType,
      qty: sellQty,
      price: Number(form.price),
      action: form.action,
      createdAt: form.date ? new Date(form.date) : serverTimestamp(),
    });

    setForm({
      symbol: "",
      companyName: "",
      stockType: "Equity",
      qty: "",
      price: "",
      action: "BUY",
      date: "",
    });

    fetchData(user.uid);

     if (user) {
      await logToolUsage({
        userId: user.uid,
        tool: "My Financials - Add Trade",
      });
    }
  };

  if (loading) return <div className={styles.loader}>Loading...</div>;

  return (
    <div className={styles.container}>
      <button className={styles.backBtn} onClick={() => router.back()}>
        ← Back
      </button>

      <h1 className={styles.pageTitle}>📈 Portfolio Manager</h1>

      {/* KPI */}
      <div className={styles.kpiGrid}>
        <div className={styles.card}>
          <span>Total Invest</span>
          <h2>₹{totalInvest.toLocaleString()}</h2>
        </div>
        <div className={styles.card}>
          <span>Current Invest</span>
          <h2>₹{totals.currentInvest.toLocaleString()}</h2>
        </div>
        <div className={styles.card}>
          <span>Total Profit / Loss</span>
          <h2 style={{ color: totals.totalPL >= 0 ? "green" : "red" }}>
            ₹{totals.totalPL.toLocaleString()}
          </h2>
        </div>
        <div className={styles.card}>
          <span>Total Stocks</span>
          <h2>{totals.totalStocks}</h2>
        </div>
      </div>

      {/* FORM */}
      <form onSubmit={addTrade} className={styles.addForm}>
        <input
          list="symbolList"
          placeholder="Symbol"
          value={form.symbol}
          onChange={(e) => {
            const val = e.target.value.toUpperCase();
            setForm({ ...form, symbol: val, companyName: companyList[val] || "" });
          }}
          required
        />
        <datalist id="symbolList">
          {Object.keys(companyList).map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>

        <input
          placeholder="Company Name"
          value={form.companyName}
          onChange={(e) => setForm({ ...form, companyName: e.target.value })}
          required
        />

        <select
          value={form.stockType}
          onChange={(e) => setForm({ ...form, stockType: e.target.value })}
        >
          <option disabled>Default</option>
          <option>Equity</option>
          <option>ETF</option>
          <option>Crypto</option>
        </select>

        <input
          type="number"
          placeholder="Qty"
          value={form.qty}
          onChange={(e) => setForm({ ...form, qty: e.target.value })}
          required
        />
        <input
          type="number"
          placeholder="Price"
          value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
          required
        />
        <input
          type="datetime-local"
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
        />
        <select
          value={form.action}
          onChange={(e) => setForm({ ...form, action: e.target.value })}
        >
          <option value="BUY">BUY</option>
          <option value="SELL">SELL</option>
        </select>

        <button type="submit">Add Trade</button>
      </form>

      {/* TABLE */}
      <div className={styles.tableWrapper}>
        <h3>Transaction History</h3>
        <div className={styles.scrollTable}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Status</th>
                <th>Company</th>
                <th>Symbol</th>
                <th>Type</th>
                <th>Action</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Total Amount</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t, i) => (
                <tr key={i}>
                  <td>{t.action === "BUY" ? "🟢" : "🔴"}</td>
                  <td>{t.companyName}</td>
                  <td>{t.symbol}</td>
                  <td>{t.stockType}</td>
                  <td style={{ color: t.action === "BUY" ? "green" : "red" }}>
                    {t.action}
                  </td>
                  <td>{t.qty}</td>
                  <td>₹{Number(t.price).toFixed(2)}</td>
                  <td>₹{(Number(t.qty) * Number(t.price)).toFixed(2)}</td>
                  <td>
                    {new Date(
                      t.createdAt?.seconds ? t.createdAt.seconds * 1000 : t.createdAt
                    ).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
