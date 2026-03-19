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
    charges: "", // ✅ NEW
    action: "BUY",
    date: "",
    id: null,
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
      const qty = Number(tx.qty);
      const price = Number(tx.price);
      const charges = Number(tx.charges || 0);

      if (!map[tx.symbol]) {
        map[tx.symbol] = { companyName: tx.companyName, lots: [], qty: 0, invested: 0, realized: 0 };
      }

      const stock = map[tx.symbol];

      if (tx.action === "BUY") {
        const totalCost = qty * price + charges;

        stock.lots.push({ qty, price: totalCost / qty });
        stock.qty += qty;
        stock.invested += totalCost;
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

        stock.realized -= charges; // ✅ NEW
      }
    });

    return Object.entries(map).map(([symbol, data]) => ({ symbol, ...data }));
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
      .reduce(
        (sum, t) =>
          sum +
          Number(t.qty) * Number(t.price) +
          Number(t.charges || 0), // ✅ NEW
        0
      ) || 0;

  // ---------------- SAVE TRADE ----------------
  const saveTrade = async (e) => {
    e.preventDefault();

    const symbol = form.symbol.toUpperCase();
    const qty = Number(form.qty);
    const price = Number(form.price);
    const charges = Number(form.charges || 0);

    if (form.action === "SELL") {
      const currentStock = holdings.find((h) => h.symbol === symbol);
      if (!currentStock || qty > currentStock.qty) {
        alert("Not enough stock to sell!");
        return;
      }
    }

    if (form.id) {
      await updateDoc(doc(db, "transactions", form.id), {
        symbol, companyName: form.companyName, stockType: form.stockType,
        qty, price, charges, action: form.action,
        createdAt: form.date ? new Date(form.date) : serverTimestamp(),
      });
    } else {
      await addDoc(collection(db, "transactions"), {
        userId: user.uid, symbol, companyName: form.companyName,
        stockType: form.stockType, qty, price, charges,
        action: form.action,
        createdAt: form.date ? new Date(form.date) : serverTimestamp(),
      });
    }

    setForm({
      symbol: "",
      companyName: "",
      stockType: "Equity",
      qty: "",
      price: "",
      charges: "",
      action: "BUY",
      date: "",
      id: null,
    });

    fetchData(user.uid);

    if (user) {
      await logToolUsage({
        userId: user.uid,
        tool: form.id ? "Edit Trade" : "Add Trade",
      });
    }
  };

  // ---------------- DELETE ----------------
  const deleteTrade = async (id) => {
    if (!window.confirm("Delete this trade?")) return;
    await deleteDoc(doc(db, "transactions", id));
    fetchData(user.uid);
  };

  const formatDate = (createdAt) => {
    const d = new Date(createdAt?.seconds ? createdAt.seconds * 1000 : createdAt);
    return d.toLocaleString("en-IN");
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className={styles.container}>

      <button onClick={() => router.back()} className={styles.backBtn}>← Back</button>

      <h1 className={styles.pageTitle}>📈 Portfolio Manager</h1>

      {/* KPI */}
      <div className={styles.kpiGrid}>
        <div className={styles.card}>
          <span>Total Invested</span>
          <h2>₹{totalInvest.toFixed(2)}</h2>
        </div>

        <div className={styles.card}>
          <span>Current Value</span>
          <h2>₹{totals.currentInvest.toFixed(2)}</h2>
        </div>

        <div className={styles.card}>
          <span>P&L</span>
          <h2 style={{ color: totals.totalPL >= 0 ? "green" : "red" }}>
            ₹{totals.totalPL.toFixed(2)}
          </h2>
        </div>
      </div>

      {/* FORM */}
      <form onSubmit={saveTrade} className={styles.addForm}>
        <input placeholder="Symbol" value={form.symbol}
          onChange={(e) => setForm({ ...form, symbol: e.target.value })} required />

        <input placeholder="Company" value={form.companyName}
          onChange={(e) => setForm({ ...form, companyName: e.target.value })} />

        <input type="number" placeholder="Qty" value={form.qty}
          onChange={(e) => setForm({ ...form, qty: e.target.value })} required />

        <input type="number" placeholder="Price" value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })} required />

        {/* ✅ NEW FIELD */}
        <input type="number" placeholder="Charges"
          value={form.charges}
          onChange={(e) => setForm({ ...form, charges: e.target.value })} />

        <select value={form.action}
          onChange={(e) => setForm({ ...form, action: e.target.value })}>
          <option value="BUY">BUY</option>
          <option value="SELL">SELL</option>
        </select>

        <button type="submit">Save</button>
      </form>

      {/* TABLE */}
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Charges</th> {/* NEW */}
            <th>Action</th>
            <th>Total</th>
          </tr>
        </thead>

        <tbody>
          {transactions.map((t) => (
            <tr key={t.id}>
              <td>{t.symbol}</td>
              <td>{t.qty}</td>
              <td>₹{t.price}</td>
              <td>₹{t.charges || 0}</td>
              <td>{t.action}</td>
              <td>
                ₹{(t.qty * t.price + (t.charges || 0)).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

    </div>
  );
}
