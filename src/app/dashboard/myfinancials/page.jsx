"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
    charges: "",
    action: "BUY",
    date: "",
    id: null,
  });

  const router = useRouter();

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

  // FIFO ENGINE
  const holdings = useMemo(() => {
    const map = {};

    transactions.forEach((tx) => {
      const qty = Number(tx.qty);
      const price = Number(tx.price);
      const charges = Number(tx.charges || 0);

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
        const totalCost = qty * price + charges;

        stock.lots.push({
          qty,
          price: totalCost / qty,
        });

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

        stock.realized -= charges;
      }
    });

    return Object.entries(map).map(([symbol, data]) => ({
      symbol,
      ...data,
    }));
  }, [transactions]);

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
          Number(t.charges || 0),
        0
      ) || 0;

  // SAVE
  const saveTrade = async (e) => {
    e.preventDefault();

    const data = {
      userId: user.uid,
      symbol: form.symbol.toUpperCase(),
      companyName: form.companyName,
      stockType: form.stockType,
      qty: Number(form.qty),
      price: Number(form.price),
      charges: Number(form.charges || 0),
      action: form.action,
      createdAt: form.date ? new Date(form.date) : serverTimestamp(),
    };

    if (form.id) {
      await updateDoc(doc(db, "transactions", form.id), data);
    } else {
      await addDoc(collection(db, "transactions"), data);
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
  };

  const deleteTrade = async (id) => {
    await deleteDoc(doc(db, "transactions", id));
    fetchData(user.uid);
  };

  if (loading) return <div className={styles.loader}>Loading...</div>;

  return (
    <div className={styles.container}>
      <button onClick={() => router.back()} className={styles.backBtn}>
        ← Back
      </button>

      <h1 className={styles.title}>Portfolio Manager</h1>

      {/* KPI */}
      <div className={styles.grid}>
        <div className={styles.card}>
          <span>Total Invested</span>
          <h2>₹{totalInvest.toFixed(2)}</h2>
        </div>
        <div className={styles.card}>
          <span>Current Invest</span>
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
      <form onSubmit={saveTrade} className={styles.form}>
        <input
          placeholder="Symbol"
          value={form.symbol}
          onChange={(e) =>
            setForm({ ...form, symbol: e.target.value })
          }
          required
        />

        <input
          placeholder="Company"
          value={form.companyName}
          onChange={(e) =>
            setForm({ ...form, companyName: e.target.value })
          }
        />

        <input
          type="number"
          placeholder="Qty"
          value={form.qty}
          onChange={(e) =>
            setForm({ ...form, qty: e.target.value })
          }
          required
        />

        <input
          type="number"
          placeholder="Price"
          value={form.price}
          onChange={(e) =>
            setForm({ ...form, price: e.target.value })
          }
          required
        />

        <input
          type="number"
          placeholder="Charges"
          value={form.charges}
          onChange={(e) =>
            setForm({ ...form, charges: e.target.value })
          }
        />

        <select
          value={form.action}
          onChange={(e) =>
            setForm({ ...form, action: e.target.value })
          }
        >
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
            <th>Charges</th>
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
                ₹
                {(
                  t.qty * t.price +
                  (t.action === "BUY" ? t.charges || 0 : 0)
                ).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
