"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  buildEntryMessage,
  openWhatsAppMessage,
  // sendWhatsAppViaCloudAPI, // uncomment to use fully-automatic sending instead (see app/api/send-whatsapp/route.js)
} from "@/lib/whatsapp";
import styles from "./dairy.module.css";

const DAIRY_NAME = "Vikash Dairy"; // change to your dairy's name — used in the WhatsApp message signature
const MILK_TYPES = ["Cow", "Buffalo", "Mixed"];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function currentShiftGuess() {
  const h = new Date().getHours();
  return h < 12 ? "morning" : "evening";
}
function fmtDate(d) {
  try {
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return d;
  }
}
function initials(name = "") {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
}

const EMPTY_ENTRY_FORM = {
  customerId: "",
  date: todayISO(),
  time: nowTime(),
  shift: currentShiftGuess(),
  fat: "",
  liters: "",
  rate: "",
  cmFundRs: "0",
  note: "",
};

const EMPTY_CUSTOMER_FORM = {
  name: "",
  phone: "",
  address: "",
  milkType: "Cow",
  rate: "",
  notes: "",
};

export default function DairyPage() {
  const [customers, setCustomers] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("entries");
  const [toast, setToast] = useState(null);

  const [entryForm, setEntryForm] = useState(EMPTY_ENTRY_FORM);
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [savingEntry, setSavingEntry] = useState(false);

  const [customerForm, setCustomerForm] = useState(EMPTY_CUSTOMER_FORM);
  const [editingCustomerId, setEditingCustomerId] = useState(null);
  const [savingCustomer, setSavingCustomer] = useState(false);

  const [entrySearch, setEntrySearch] = useState("");
  const [shiftFilter, setShiftFilter] = useState("all");
  const [customerSearch, setCustomerSearch] = useState("");

  /* ─── Firestore subscriptions ─── */
  useEffect(() => {
    const custQ = query(collection(db, "customers"), orderBy("name"));
    const unsubCust = onSnapshot(
      custQ,
      (snap) => setCustomers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => showToast(`Customers load failed: ${err.message}`, "error")
    );

    const entriesQ = query(collection(db, "entries"), orderBy("createdAt", "desc"));
    const unsubEntries = onSnapshot(
      entriesQ,
      (snap) => {
        setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        showToast(`Entries load failed: ${err.message}`, "error");
        setLoading(false);
      }
    );

    return () => {
      unsubCust();
      unsubEntries();
    };
  }, []);

  function showToast(message, type = "info") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  const customerMap = useMemo(() => {
    const m = new Map();
    customers.forEach((c) => m.set(c.id, c));
    return m;
  }, [customers]);

  /* ─── Derived totals: Total RS = Liters × Rate, Amount = Total RS − CMFund RS ─── */
  const totalRs = useMemo(() => {
    const liters = parseFloat(entryForm.liters);
    const rate = parseFloat(entryForm.rate);
    if (isNaN(liters) || isNaN(rate)) return 0;
    return Math.round(liters * rate * 100) / 100;
  }, [entryForm.liters, entryForm.rate]);

  const cmFundValue = useMemo(() => {
    const v = parseFloat(entryForm.cmFundRs);
    return isNaN(v) ? 0 : v;
  }, [entryForm.cmFundRs]);

  const finalAmount = useMemo(() => {
    return Math.round((totalRs - cmFundValue) * 100) / 100;
  }, [totalRs, cmFundValue]);

  /* ─── Today stats ─── */
  const todayStats = useMemo(() => {
    const today = todayISO();
    const todays = entries.filter((e) => e.date === today);
    const liters = todays.reduce((s, e) => s + (Number(e.liters) || 0), 0);
    const amount = todays.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const morning = todays.filter((e) => e.shift === "morning").length;
    const evening = todays.filter((e) => e.shift === "evening").length;
    return { liters, amount, morning, evening, count: todays.length };
  }, [entries]);

  /* ─── Entry form handlers ─── */
  function handleEntryFieldChange(field, value) {
    if (field === "customerId") {
      const c = customerMap.get(value);
      setEntryForm((f) => ({ ...f, customerId: value, rate: c?.rate ? String(c.rate) : f.rate }));
      return;
    }
    setEntryForm((f) => ({ ...f, [field]: value }));
  }

  function resetEntryForm() {
    setEntryForm(EMPTY_ENTRY_FORM);
    setEditingEntryId(null);
  }

  async function handleEntrySubmit(e) {
    e.preventDefault();
    const { customerId, date, time, shift, fat, liters, rate, note } = entryForm;
    const customer = customerMap.get(customerId);

    if (!customer) return showToast("Select a customer (Name) first", "error");
    if (!liters || Number(liters) <= 0) return showToast("Enter valid Liters", "error");
    if (fat === "" || Number(fat) < 0) return showToast("Enter Fat %", "error");
    if (!rate || Number(rate) <= 0) return showToast("Enter Rate/Ltr", "error");
    if (cmFundValue < 0) return showToast("CMFund RS can't be negative", "error");
    if (finalAmount < 0) return showToast("CMFund RS is larger than Total RS — check values", "error");

    setSavingEntry(true);
    try {
      const payload = {
        customerId,
        customerName: customer.name,
        customerPhone: customer.phone,
        date,
        time,
        shift,
        fat: Number(fat),
        liters: Number(liters),
        rate: Number(rate),
        totalRs,
        cmFundRs: cmFundValue,
        amount: finalAmount,
        note: note || "",
      };

      if (editingEntryId) {
        await updateDoc(doc(db, "entries", editingEntryId), payload);
        showToast("Entry updated", "success");
      } else {
        await addDoc(collection(db, "entries"), {
          ...payload,
          waSent: false,
          createdAt: serverTimestamp(),
        });
        showToast("Entry saved", "success");

        // Fire the WhatsApp notification right after saving.
        if (customer.phone) {
          const message = buildEntryMessage({
            customerName: customer.name,
            date: fmtDate(date),
            shift,
            liters: payload.liters,
            fat: payload.fat,
            rate: payload.rate,
            totalRs: payload.totalRs,
            cmFundRs: payload.cmFundRs,
            amount: payload.amount,
            dairyName: DAIRY_NAME,
          });
          openWhatsAppMessage(customer.phone, message);
          // To send silently with no click, configure the Cloud API route and instead call:
          // await sendWhatsAppViaCloudAPI(customer.phone, message);
        } else {
          showToast("No phone number on file — WhatsApp message skipped", "info");
        }
      }

      resetEntryForm();
    } catch (err) {
      showToast(`Save failed: ${err.message}`, "error");
    } finally {
      setSavingEntry(false);
    }
  }

  function startEditEntry(entry) {
    setEditingEntryId(entry.id);
    setEntryForm({
      customerId: entry.customerId,
      date: entry.date,
      time: entry.time || nowTime(),
      shift: entry.shift,
      fat: String(entry.fat),
      liters: String(entry.liters),
      rate: String(entry.rate),
      cmFundRs: String(entry.cmFundRs ?? 0),
      note: entry.note || "",
    });
    setActiveTab("entries");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteEntry(id) {
    if (!confirm("Delete this entry?")) return;
    try {
      await deleteDoc(doc(db, "entries", id));
      showToast("Entry deleted", "success");
    } catch (err) {
      showToast(`Delete failed: ${err.message}`, "error");
    }
  }

  function resendWhatsApp(entry) {
    const customer = customerMap.get(entry.customerId);
    const phone = entry.customerPhone || customer?.phone;
    if (!phone) return showToast("No phone number for this customer", "error");
    const message = buildEntryMessage({
      customerName: entry.customerName,
      date: fmtDate(entry.date),
      shift: entry.shift,
      liters: entry.liters,
      fat: entry.fat,
      rate: entry.rate,
      totalRs: entry.totalRs ?? entry.liters * entry.rate,
      cmFundRs: entry.cmFundRs ?? 0,
      amount: entry.amount,
      dairyName: DAIRY_NAME,
    });
    openWhatsAppMessage(phone, message);
  }

  /* ─── Customer form handlers ─── */
  function handleCustomerFieldChange(field, value) {
    setCustomerForm((f) => ({ ...f, [field]: value }));
  }

  function resetCustomerForm() {
    setCustomerForm(EMPTY_CUSTOMER_FORM);
    setEditingCustomerId(null);
  }

  async function handleCustomerSubmit(e) {
    e.preventDefault();
    const { name, phone, address, milkType, rate, notes } = customerForm;
    if (!name.trim()) return showToast("Enter customer name", "error");
    if (!phone.trim() || phone.replace(/\D/g, "").length < 10)
      return showToast("Enter a valid phone number", "error");
    if (!rate || Number(rate) <= 0) return showToast("Enter default rate per liter", "error");

    setSavingCustomer(true);
    try {
      const payload = {
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        milkType,
        rate: Number(rate),
        notes: notes.trim(),
      };

      if (editingCustomerId) {
        await updateDoc(doc(db, "customers", editingCustomerId), payload);
        showToast("Customer updated", "success");
      } else {
        await addDoc(collection(db, "customers"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        showToast("Customer registered", "success");
      }
      resetCustomerForm();
    } catch (err) {
      showToast(`Save failed: ${err.message}`, "error");
    } finally {
      setSavingCustomer(false);
    }
  }

  function startEditCustomer(c) {
    setEditingCustomerId(c.id);
    setCustomerForm({
      name: c.name,
      phone: c.phone,
      address: c.address || "",
      milkType: c.milkType || "Cow",
      rate: String(c.rate ?? ""),
      notes: c.notes || "",
    });
    setActiveTab("customers");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteCustomer(id) {
    if (!confirm("Delete this customer? Their past entries will stay on record.")) return;
    try {
      await deleteDoc(doc(db, "customers", id));
      showToast("Customer deleted", "success");
    } catch (err) {
      showToast(`Delete failed: ${err.message}`, "error");
    }
  }

  /* ─── Derived lists ─── */
  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (shiftFilter !== "all" && e.shift !== shiftFilter) return false;
      if (entrySearch.trim()) {
        const s = entrySearch.toLowerCase();
        if (!e.customerName?.toLowerCase().includes(s) && !e.date?.includes(s)) return false;
      }
      return true;
    });
  }, [entries, shiftFilter, entrySearch]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers;
    const s = customerSearch.toLowerCase();
    return customers.filter(
      (c) => c.name.toLowerCase().includes(s) || c.phone?.includes(s) || c.address?.toLowerCase().includes(s)
    );
  }, [customers, customerSearch]);

  return (
    <div className={styles.page}>
      {toast && <div className={`${styles.toast} ${styles[`toast_${toast.type}`]}`}>{toast.message}</div>}

      {/* TOP BAR */}
      <div className={styles.topBar}>
        <Link href="/dashboard" className={styles.backBtn}>
          ← Back
        </Link>
        <div className={styles.titleArea}>
          <div className={styles.title}>
            🥛 Dairy Manager <span className={styles.vBadge}>v1.0</span>
          </div>
          <div className={styles.subtitle}>Customer entries, rates &amp; WhatsApp receipts</div>
        </div>
      </div>

      {/* STATS */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statIcon}>👥</span>
          <div>
            <span className={styles.statValue}>{customers.length}</span>
            <span className={styles.statLabel}>Customers</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statIcon}>🧴</span>
          <div>
            <span className={styles.statValue}>{todayStats.liters.toFixed(1)} L</span>
            <span className={styles.statLabel}>Today's Liters</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statIcon}>💰</span>
          <div>
            <span className={styles.statValue}>₹{todayStats.amount.toFixed(2)}</span>
            <span className={styles.statLabel}>Today's Amount</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statIcon}>🌅</span>
          <div>
            <span className={styles.statValue}>{todayStats.morning}</span>
            <span className={styles.statLabel}>Morning Entries</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statIcon}>🌆</span>
          <div>
            <span className={styles.statValue}>{todayStats.evening}</span>
            <span className={styles.statLabel}>Evening Entries</span>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className={styles.tabNav}>
        <button
          className={`${styles.tabBtn} ${activeTab === "entries" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("entries")}
        >
          📋 Entries
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === "customers" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("customers")}
        >
          👥 Customers
        </button>
      </div>

      {activeTab === "entries" && (
        <>
          {/* ADD / EDIT ENTRY */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <span>{editingEntryId ? "✏️" : "➕"}</span>
              <h2>{editingEntryId ? "Edit Entry" : "New Milk Entry"}</h2>
              {editingEntryId && (
                <div className={styles.cardHeadRight}>
                  <button className={styles.smBtn} onClick={resetEntryForm} type="button">
                    Cancel edit
                  </button>
                </div>
              )}
            </div>

            <form onSubmit={handleEntrySubmit}>
              <div className={styles.entryForm}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Name</label>
                  <select
                    className={styles.formSelect}
                    value={entryForm.customerId}
                    onChange={(e) => handleEntryFieldChange("customerId", e.target.value)}
                    required
                  >
                    <option value="">Select customer</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} — {c.phone}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Date</label>
                  <input
                    type="date"
                    className={styles.formInput}
                    value={entryForm.date}
                    onChange={(e) => handleEntryFieldChange("date", e.target.value)}
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Time</label>
                  <input
                    type="time"
                    className={styles.formInput}
                    value={entryForm.time}
                    onChange={(e) => handleEntryFieldChange("time", e.target.value)}
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Shift</label>
                  <div className={styles.shiftToggleRow}>
                    <button
                      type="button"
                      className={`${styles.shiftBtn} ${entryForm.shift === "morning" ? styles.shiftMorningActive : ""}`}
                      onClick={() => handleEntryFieldChange("shift", "morning")}
                    >
                      🌅 Morning
                    </button>
                    <button
                      type="button"
                      className={`${styles.shiftBtn} ${entryForm.shift === "evening" ? styles.shiftEveningActive : ""}`}
                      onClick={() => handleEntryFieldChange("shift", "evening")}
                    >
                      🌆 Evening
                    </button>
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Fat (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="e.g. 6.2"
                    className={styles.formInput}
                    value={entryForm.fat}
                    onChange={(e) => handleEntryFieldChange("fat", e.target.value)}
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Liters</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="e.g. 5.5"
                    className={styles.formInput}
                    value={entryForm.liters}
                    onChange={(e) => handleEntryFieldChange("liters", e.target.value)}
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Rate/Ltr (₹)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="e.g. 45"
                    className={styles.formInput}
                    value={entryForm.rate}
                    onChange={(e) => handleEntryFieldChange("rate", e.target.value)}
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>CMFund RS (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g. 2"
                    className={styles.formInput}
                    value={entryForm.cmFundRs}
                    onChange={(e) => handleEntryFieldChange("cmFundRs", e.target.value)}
                  />
                </div>

                <div className={`${styles.formGroup} ${styles.entryFormWide}`}>
                  <label className={styles.formLabel}>Note (optional)</label>
                  <input
                    type="text"
                    placeholder="Any remark for this entry"
                    className={styles.formInput}
                    value={entryForm.note}
                    onChange={(e) => handleEntryFieldChange("note", e.target.value)}
                  />
                </div>

                {/* Live calculation: Total RS = Liters × Rate/Ltr, Amount = Total RS − CMFund RS */}
                <div className={styles.breakdownRow}>
                  <div className={styles.breakdownItem}>
                    <span className={styles.breakdownLabel}>Total RS</span>
                    <span className={styles.breakdownValue}>₹{totalRs.toFixed(2)}</span>
                  </div>
                  <div className={styles.breakdownOp}>−</div>
                  <div className={styles.breakdownItem}>
                    <span className={styles.breakdownLabel}>CMFund RS</span>
                    <span className={`${styles.breakdownValue} ${styles.breakdownValueMinus}`}>
                      ₹{cmFundValue.toFixed(2)}
                    </span>
                  </div>
                  <div className={styles.breakdownOp}>=</div>
                  <div className={styles.breakdownItem}>
                    <span className={styles.breakdownLabel}>Final Amount</span>
                    <span className={`${styles.breakdownValue} ${styles.breakdownValueFinal}`}>
                      ₹{finalAmount.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className={styles.autoCalcNote}>
                  <span>
                    Total RS = Liters × Rate/Ltr &nbsp;|&nbsp; Amount = Total RS − CMFund RS
                  </span>
                  <span className={styles.waHint}>
                    {editingEntryId ? "Saving won't resend WhatsApp" : "📲 WhatsApp opens automatically after saving"}
                  </span>
                </div>
              </div>

              <button className={styles.addBtn} type="submit" disabled={savingEntry}>
                {savingEntry ? "Saving..." : editingEntryId ? "Update Entry" : "Save Entry & Notify"}
              </button>
            </form>
          </div>

          {/* ENTRY LIST */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <span>📋</span>
              <h2>All Entries</h2>
              <div className={styles.cardHeadRight}>
                <input
                  className={styles.searchInput}
                  placeholder="Search name or date..."
                  value={entrySearch}
                  onChange={(e) => setEntrySearch(e.target.value)}
                />
              </div>
            </div>

            <div className={styles.filterRow}>
              <div className={styles.filterBtns}>
                {["all", "morning", "evening"].map((s) => (
                  <button
                    key={s}
                    className={`${styles.filterChip} ${shiftFilter === s ? styles.filterChipActive : ""}`}
                    onClick={() => setShiftFilter(s)}
                  >
                    {s === "all" ? "All" : s === "morning" ? "🌅 Morning" : "🌆 Evening"}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.resultCount}>{filteredEntries.length} entries</div>

            {loading ? (
              <div className={styles.emptyState}>Loading entries...</div>
            ) : filteredEntries.length === 0 ? (
              <div className={styles.emptyState}>No entries yet. Add the first one above.</div>
            ) : (
              <div className={styles.entryList}>
                {filteredEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className={`${styles.entryCard} ${entry.shift === "morning" ? styles.entryMorning : styles.entryEvening}`}
                  >
                    <div className={styles.entryAvatar}>{initials(entry.customerName)}</div>
                    <div className={styles.entryBody}>
                      <div className={styles.entryTop}>
                        <span className={styles.entryName}>{entry.customerName}</span>
                        <span
                          className={`${styles.shiftBadge} ${
                            entry.shift === "morning" ? styles.shiftBadgeMorning : styles.shiftBadgeEvening
                          }`}
                        >
                          {entry.shift === "morning" ? "Morning" : "Evening"}
                        </span>
                      </div>
                      <div className={styles.entryMeta}>
                        <span className={styles.entryMetaItem}>📅 {fmtDate(entry.date)} {entry.time}</span>
                        <span className={styles.entryMetaItem}>🧴 {entry.liters} L</span>
                        <span className={styles.entryMetaItem}>🧈 {entry.fat}% fat</span>
                        <span className={styles.entryMetaItem}>₹{entry.rate}/L</span>
                      </div>
                      {entry.note && <div className={styles.entryMeta}>📝 {entry.note}</div>}
                    </div>
                    <div>
                      <div className={styles.entryAmount}>₹{Number(entry.amount).toFixed(2)}</div>
                      <div className={styles.entryAmountSub}>
                        Total ₹{Number(entry.totalRs ?? entry.liters * entry.rate).toFixed(2)} − CMFund ₹
                        {Number(entry.cmFundRs ?? 0).toFixed(2)}
                      </div>
                      <button
                        className={styles.waSentBadge}
                        style={{ border: "none", cursor: "pointer" }}
                        onClick={() => resendWhatsApp(entry)}
                        type="button"
                        title="Resend WhatsApp message"
                      >
                        📲 Send WhatsApp
                      </button>
                    </div>
                    <div className={styles.entryActions}>
                      <button className={styles.iconBtnSm} onClick={() => startEditEntry(entry)} title="Edit">
                        ✏️
                      </button>
                      <button
                        className={`${styles.iconBtnSm} ${styles.iconBtnDanger}`}
                        onClick={() => deleteEntry(entry.id)}
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === "customers" && (
        <>
          {/* ADD / EDIT CUSTOMER */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <span>{editingCustomerId ? "✏️" : "➕"}</span>
              <h2>{editingCustomerId ? "Edit Customer" : "Register New Customer"}</h2>
              {editingCustomerId && (
                <div className={styles.cardHeadRight}>
                  <button className={styles.smBtn} onClick={resetCustomerForm} type="button">
                    Cancel edit
                  </button>
                </div>
              )}
            </div>

            <form onSubmit={handleCustomerSubmit}>
              <div className={styles.customerForm}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Full Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Ramesh Kumar"
                    className={styles.formInput}
                    value={customerForm.name}
                    onChange={(e) => handleCustomerFieldChange("name", e.target.value)}
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>WhatsApp Number</label>
                  <div className={styles.phoneInputWrap}>
                    <span className={styles.phoneCode}>+91</span>
                    <input
                      type="tel"
                      placeholder="10-digit mobile number"
                      className={styles.formInput}
                      value={customerForm.phone}
                      onChange={(e) => handleCustomerFieldChange("phone", e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Milk Type</label>
                  <select
                    className={styles.formSelect}
                    value={customerForm.milkType}
                    onChange={(e) => handleCustomerFieldChange("milkType", e.target.value)}
                  >
                    {MILK_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Default Rate (₹ / Liter)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="e.g. 45"
                    className={styles.formInput}
                    value={customerForm.rate}
                    onChange={(e) => handleCustomerFieldChange("rate", e.target.value)}
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Address</label>
                  <input
                    type="text"
                    placeholder="Village / area"
                    className={styles.formInput}
                    value={customerForm.address}
                    onChange={(e) => handleCustomerFieldChange("address", e.target.value)}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Notes (optional)</label>
                  <input
                    type="text"
                    placeholder="Any remark"
                    className={styles.formInput}
                    value={customerForm.notes}
                    onChange={(e) => handleCustomerFieldChange("notes", e.target.value)}
                  />
                </div>
              </div>

              <button className={styles.addBtn} type="submit" disabled={savingCustomer}>
                {savingCustomer ? "Saving..." : editingCustomerId ? "Update Customer" : "Register Customer"}
              </button>
            </form>
          </div>

          {/* CUSTOMER LIST */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <span>👥</span>
              <h2>Customers</h2>
              <div className={styles.cardHeadRight}>
                <input
                  className={styles.searchInput}
                  placeholder="Search name, phone, address..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                />
              </div>
            </div>

            <div className={styles.resultCount}>{filteredCustomers.length} customers</div>

            {filteredCustomers.length === 0 ? (
              <div className={styles.emptyState}>No customers yet. Register the first one above.</div>
            ) : (
              <div className={styles.customerGrid}>
                {filteredCustomers.map((c) => (
                  <div key={c.id} className={styles.customerCard}>
                    <div className={styles.customerCardHead}>
                      <div className={styles.customerAvatar}>{initials(c.name)}</div>
                      <div>
                        <div className={styles.customerName}>{c.name}</div>
                        <div className={styles.customerPhone}>📱 {c.phone}</div>
                      </div>
                      <span className={styles.milkTypeBadge}>{c.milkType}</span>
                    </div>
                    <div className={styles.customerMetaRow}>
                      <span>Rate</span>
                      <strong>₹{c.rate}/L</strong>
                    </div>
                    {c.address && (
                      <div className={styles.customerMetaRow}>
                        <span>Address</span>
                        <span>{c.address}</span>
                      </div>
                    )}
                    {c.notes && (
                      <div className={styles.customerMetaRow}>
                        <span>Notes</span>
                        <span>{c.notes}</span>
                      </div>
                    )}
                    <div className={styles.customerActions}>
                      <button className={styles.smBtn} onClick={() => startEditCustomer(c)}>
                        ✏️ Edit
                      </button>
                      <button className={styles.smBtn} onClick={() => deleteCustomer(c.id)}>
                        🗑️ Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
