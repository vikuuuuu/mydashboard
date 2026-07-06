"use client";

import React, { useState, useEffect } from "react";
// Exact structural imports based on your /src/lib folder structure
import { db } from "../../../lib/firestore"; 
import { collection, addDoc, query, orderBy, onSnapshot } from "firebase/firestore";
import styles from "./page.module.css";

export default function MilkDairyManagement() {
  // UI Tabs & Functional States
  const [activeTab, setActiveTab] = useState("entries"); // entries | register | records
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  // Database States
  const [customers, setCustomers] = useState([]);
  const [entries, setEntries] = useState([]);

  // Form State: Collection Entries
  const [entryForm, setEntryForm] = useState({
    customerId: "",
    date: new Date().toISOString().split('T')[0],
    shift: "M",
    liters: "",
    fat: "",
    snf: "8.50", 
    cmFund: "20.0"
  });

  // Form State: Customer Registration
  const [customerForm, setCustomerForm] = useState({
    id: "",
    name: "",
    phone: "",
    village: ""
  });

  // Real-time Database Synchronization Listeners
  useEffect(() => {
    if (!db) return;

    // 1. Listen to Customers
    const customersQuery = query(collection(db, "customers"), orderBy("name", "asc"));
    const unsubscribeCustomers = onSnapshot(customersQuery, (snapshot) => {
      const customersList = snapshot.docs.map(doc => ({ docId: doc.id, ...doc.data() }));
      setCustomers(customersList);
    }, (error) => {
      console.error("Error fetching customers:", error);
    });

    // 2. Listen to Milk Entries
    const entriesQuery = query(collection(db, "milk_entries"), orderBy("timestamp", "desc"));
    const unsubscribeEntries = onSnapshot(entriesQuery, (snapshot) => {
      const entriesList = snapshot.docs.map(doc => ({ docId: doc.id, ...doc.data() }));
      setEntries(entriesList);
    }, (error) => {
      console.error("Error fetching entries:", error);
    });

    return () => {
      unsubscribeCustomers();
      unsubscribeEntries();
    };
  }, []);

  // Derived Analytics Data from Live DB State
  const totalLitersCollected = entries.reduce((acc, curr) => acc + parseFloat(curr.liters || 0), 0);
  const totalPayoutGenerated = entries.reduce((acc, curr) => acc + parseFloat(curr.finalAmount || 0), 0);
  const averageFatQuality = entries.length ? (entries.reduce((acc, curr) => acc + parseFloat(curr.fat || 0), 0) / entries.length).toFixed(2) : "0.00";

  // Helper: Trigger UI Notification
  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 3000);
  };

  // Feature: Calculate Milk Valuation Metrics
  const calculateRateAndTotal = (fat, snf, liters) => {
    const f = parseFloat(fat) || 0;
    const l = parseFloat(liters) || 0;
    
    const baseRatePerFat = 10.592; 
    const calculatedRate = parseFloat((f * baseRatePerFat).toFixed(2));
    const rawTotal = parseFloat((calculatedRate * l).toFixed(2));
    return { rate: calculatedRate, total: rawTotal };
  };

  // Operational Action: Add Milk Entry Transaction
  const handleAddEntry = async (e) => {
    e.preventDefault();
    if (!entryForm.customerId || !entryForm.liters || !entryForm.fat) {
      showToast("Please fill all mandatory fields.", "error");
      return;
    }

    setLoading(true);
    const selectedCustomer = customers.find(c => c.id === entryForm.customerId);
    const { rate, total } = calculateRateAndTotal(entryForm.fat, entryForm.snf, entryForm.liters);
    const fund = parseFloat(entryForm.cmFund) || 0;
    const netPayout = parseFloat((total - fund).toFixed(2));

    const itemPayload = {
      customerId: entryForm.customerId,
      name: selectedCustomer ? selectedCustomer.name : "Unknown Customer",
      date: entryForm.date,
      shift: entryForm.shift,
      fat: parseFloat(entryForm.fat),
      snf: parseFloat(entryForm.snf),
      liters: parseFloat(entryForm.liters),
      rate: rate,
      total: total,
      cmFund: fund,
      finalAmount: netPayout,
      timestamp: new Date().toISOString()
    };

    try {
      await addDoc(collection(db, "milk_entries"), itemPayload);
      showToast("Collection Record committed to database!");

      if (selectedCustomer && selectedCustomer.phone) {
        triggerWhatsAppNotification(selectedCustomer, itemPayload);
      }

      setEntryForm({
        customerId: "",
        date: new Date().toISOString().split('T')[0],
        shift: "M",
        liters: "",
        fat: "",
        snf: "8.50",
        cmFund: "20.0"
      });
    } catch (err) {
      console.error("Firebase Execution Error: ", err);
      showToast("Database synchronization failed.", "error");
    } finally {
      setLoading(false);
    }
  };

  // Operational Action: Register New Customer Card profile
  const handleRegisterCustomer = async (e) => {
    e.preventDefault();
    if (!customerForm.id || !customerForm.name || !customerForm.phone) {
      showToast("Please verify details are correctly provided.", "error");
      return;
    }

    setLoading(true);
    try {
      await addDoc(collection(db, "customers"), customerForm);
      showToast(`Customer [${customerForm.name}] created successfully.`);
      setCustomerForm({ id: "", name: "", phone: "", village: "" });
      setActiveTab("entries"); 
    } catch (err) {
      console.error("Firebase Registration Error: ", err);
      showToast("Customer configuration sync faulted.", "error");
    } finally {
      setLoading(false);
    }
  };

  // Feature: Automated WhatsApp Direct Notification
  const triggerWhatsAppNotification = (customer, data) => {
    const formattedMessage = encodeURIComponent(
`*Dhambiwalo Ki Dhani Dairy Ledger*
---------------------------------------
*Date:* ${data.date} (Shift: ${data.shift === 'M' ? 'Morning' : 'Evening'})
*Customer:* ${customer.name} (${customer.id})
---------------------------------------
*Qty Collected:* ${data.liters} L
*Fat Quality:* ${data.fat.toFixed(2)} % | *SNF:* ${data.snf.toFixed(2)} %
*Rate/Ltr:* Rs ${data.rate.toFixed(2)}
*Total Value:* Rs ${data.total.toFixed(2)}
*Deductions (CM Fund):* Rs ${data.cmFund.toFixed(2)}
---------------------------------------
*Net Payable Amount:* Rs ${data.finalAmount.toFixed(2)}
Thank you for your business!`
    );

    let activePhone = customer.phone.trim();
    if (!activePhone.startsWith("91") && activePhone.length === 10) {
      activePhone = "91" + activePhone;
    }

    const targetUrl = `https://api.whatsapp.com/send?phone=${activePhone}&text=${formattedMessage}`;
    window.open(targetUrl, "_blank");
  };

  return (
    <div className={styles.page}>
      {toast.show && (
        <div className={`${styles.toast} ${toast.type === "success" ? styles.toast_success : styles.toast_error}`}>
          {toast.message}
        </div>
      )}

      <div className={styles.topBar}>
        <div className={styles.titleArea}>
          <h1 className={styles.title}>
            Dairy Management Ledger <span className={styles.vBadge}>v2.4 Live</span>
          </h1>
          <p className={styles.subtitle}>Real-time automation matrix for supply optimization logistics tracking.</p>
        </div>
        <div className={styles.leftControls}>
          <button className={styles.controlBtnLive}>
            <span className={styles.pulseIcon}>●</span> SYSTEM ONLINE
          </button>
        </div>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statIcon}>🥛</span>
          <div>
            <span className={styles.statValue}>{totalLitersCollected.toFixed(2)} L</span>
            <span className={styles.statLabel">Total Volume Collected</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statIcon}>📊</span>
          <div>
            <span className={styles.statValue}>{averageFatQuality} %</span>
            <span className={styles.statLabel">Mean Fat Index</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statIcon">💸</span>
          <div>
            <span className={styles.statValue}>Rs {totalPayoutGenerated.toFixed(2)}</span>
            <span className={styles.statLabel">Net Disbursed Funds</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statIcon">👥</span>
          <div>
            <span className={styles.statValue}>{customers.length}</span>
            <span className={styles.statLabel">Active Registered Producers</span>
          </div>
        </div>
      </div>

      <div className={styles.tabNav}>
        <button className={`${styles.tabBtn} ${activeTab === "entries" ? styles.tabActive : ""}`} onClick={() => setActiveTab("entries")}>
          📥 Log Supply Delivery
        </button>
        <button className={`${styles.tabBtn} ${activeTab === "register" ? styles.tabActive : ""}`} onClick={() => setActiveTab("register")}>
          👤 Provision New Account
        </button>
        <button className={`${styles.tabBtn} ${activeTab === "records" ? styles.tabActive : ""}`} onClick={() => setActiveTab("records")}>
          📋 Historic Delivery Matrices
        </button>
      </div>

      {activeTab === "entries" && (
        <div className={styles.notesGrid}>
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <span>📝</span>
              <h2>Log Inbound Yield Delivery</h2>
            </div>
            
            <form onSubmit={handleAddEntry} className={styles.studySetupForm}>
              <div className={styles.advancedForm}>
                <div style={{ flex: 1, minWidth: "200px" }}>
                  <label className={styles.repeatLabel}>Select Producer Account Profile</label>
                  <select 
                    className={styles.formSelect} 
                    value={entryForm.customerId} 
                    onChange={(e) => setEntryForm({...entryForm, customerId: e.target.value})}
                  >
                    <option value="">-- Choose Account --</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.id} - {c.name} ({c.village})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={styles.repeatLabel}>Shift Window</label>
                  <select 
                    className={styles.formSelect}
                    value={entryForm.shift}
                    onChange={(e) => setEntryForm({...entryForm, shift: e.target.value})}
                  >
                    <option value="M">☀️ Morning (M)</option>
                    <option value="E">🌙 Evening (E)</option>
                  </select>
                </div>
              </div>

              <div className={styles.timetableForm}>
                <input 
                  type="date" 
                  className={styles.formInput} 
                  value={entryForm.date} 
                  onChange={(e) => setEntryForm({...entryForm, date: e.target.value})} 
                />
                <input 
                  type="number" 
                  step="0.01" 
                  placeholder="Quantity (Liters)" 
                  className={styles.formInput}
                  value={entryForm.liters}
                  onChange={(e) => setEntryForm({...entryForm, liters: e.target.value})}
                />
                <input 
                  type="number" 
                  step="0.01" 
                  placeholder="Fat Content %" 
                  className={styles.formInput}
                  value={entryForm.fat}
                  onChange={(e) => setEntryForm({...entryForm, fat: e.target.value})}
                />
              </div>

              <div className={styles.timetableForm}>
                <input 
                  type="number" 
                  step="0.01" 
                  placeholder="SNF Baseline %" 
                  className={styles.formInput}
                  value={entryForm.snf}
                  onChange={(e) => setEntryForm({...entryForm, snf: e.target.value})}
                />
                <input 
                  type="number" 
                  step="0.01" 
                  placeholder="CM Fund Charge" 
                  className={styles.formInput}
                  value={entryForm.cmFund}
                  onChange={(e) => setEntryForm({...entryForm, cmFund: e.target.value})}
                />
              </div>

              <button type="submit" className={styles.startModeBtn} disabled={loading}>
                🚀 Commit Entry & Send WhatsApp Notification
              </button>
            </form>
          </div>

          <div className={`${styles.card} ${styles.activeStudyPulse}`}>
            <div className={styles.cardHead}>
              <span>🧾</span>
              <h2>Real-Time Live Voucher Preview</h2>
            </div>
            <div className={styles.liveConsoleArea}>
              <h3>Dhambiwalo Ki Dhani Dairy Ledger</h3>
              <div style={{ background: "var(--surface3)", padding: "16px", borderRadius: "10px", margin: "14px 0", fontFamily: "monospace", textAlign: "left" }}>
                <p><strong>Producer ID:</strong> {entryForm.customerId || "---"}</p>
                <p><strong>Date Matrix:</strong> {entryForm.date} | Shift: {entryForm.shift}</p>
                <hr style={{ border: "0.5px dashed var(--border2)", margin: "8px 0" }} />
                <p><strong>Fat Ratio:</strong> {parseFloat(entryForm.fat || 0).toFixed(2)} %</p>
                <p><strong>SNF Index:</strong> {parseFloat(entryForm.snf || 0).toFixed(2)} %</p>
                <p><strong>Net Volume:</strong> {parseFloat(entryForm.liters || 0).toFixed(2)} Liters</p>
                <hr style={{ border: "0.5px dashed var(--border2)", margin: "8px 0" }} />
                
                {(() => {
                  const { rate, total } = calculateRateAndTotal(entryForm.fat, entryForm.snf, entryForm.liters);
                  const fund = parseFloat(entryForm.cmFund) || 0;
                  return (
                    <>
                      <p><strong>Calculated Value:</strong> Rs {rate.toFixed(2)} / L</p>
                      <p><strong>Gross Yield Total:</strong> Rs {total.toFixed(2)}</p>
                      <p style={{ color: "var(--danger)" }}><strong>CM Fund Deduction:</strong> Rs {fund.toFixed(2)}</p>
                      <h3 style={{ marginTop: "8px", color: "var(--success)" }}>Net Payout: Rs {(total - fund).toFixed(2)}</h3>
                    </>
                  );
                })()}
              </div>
              <p className={styles.sessionNoteDisplay}>Voucher recalculates instantaneously relative to input adjustments.</p>
            </div>
          </div>
        </div>
      )}

      {activeTab === "register" && (
        <div className={styles.card} style={{ maxWidth: "600px", margin: "0 auto" }}>
          <div className={styles.cardHead}>
            <span>👤</span>
            <h2>Register New Dairy Producer Account</h2>
          </div>
          <form onSubmit={handleRegisterCustomer} className={styles.studySetupForm}>
            <div className={styles.advancedForm}>
              <input 
                type="text" 
                placeholder="Unique Account Code / Card ID (e.g., 153)" 
                className={styles.formInput}
                value={customerForm.id}
                onChange={(e) => setCustomerForm({...customerForm, id: e.target.value})}
              />
            </div>
            <div className={styles.advancedForm}>
              <input 
                type="text" 
                placeholder="Producer's Full Legal Name" 
                className={styles.formInput}
                value={customerForm.name}
                onChange={(e) => setCustomerForm({...customerForm, name: e.target.value})}
              />
            </div>
            <div className={styles.advancedForm}>
              <input 
                type="text" 
                placeholder="WhatsApp Phone Number (e.g. 9116591816)" 
                className={styles.formInput}
                value={customerForm.phone}
                onChange={(e) => setCustomerForm({...customerForm, phone: e.target.value})}
              />
            </div>
            <div className={styles.advancedForm}>
              <input 
                type="text" 
                placeholder="Village / Collection Center Locale" 
                className={styles.formInput}
                value={customerForm.village}
                onChange={(e) => setCustomerForm({...customerForm, village: e.target.value})}
              />
            </div>
            <button type="submit" className={styles.addBtn} style={{ width: "100%", padding: "12px" }} disabled={loading}>
              🔒 Authorize Ledger Allocation Profile
            </button>
          </form>
        </div>
      )}

      {activeTab === "records" && (
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <span>📋</span>
            <h2>Historic Transaction Ledger Database Logs</h2>
            <div className={styles.resultCount}>{entries.length} Transaction Records committed</div>
          </div>
          <div className={styles.taskList}>
            {entries.map((item) => (
              <div key={item.docId} className={styles.taskCard}>
                <div className={styles.taskInfo}>
                  <div className={styles.taskTop}>
                    <span className={styles.typeBadge}>Shift: {item.shift}</span>
                    <span className={styles.dayBadge}>{item.date}</span>
                    <span className={styles.liveTag} style={{ background: "var(--accent)" }}>ID: {item.customerId}</span>
                  </div>
                  <h3>{item.name}</h3>
                  <p>
                    Volume Delivery: <strong>{item.liters} Liters</strong> | Fat Level: {item.fat}% | SNF: {item.snf}%
                  </p>
                  <p className={styles.taskNote}>
                    Gross Calculation base: Rs {item.rate}/L → Total: Rs {item.total} [CM Fund Deduction: Rs {item.cmFund}]
                  </p>
                </div>
                <div className={styles.taskActions}>
                  <span className={styles.goodScore}>Rs {item.finalAmount}</span>
                </div>
              </div>
            ))}
            {entries.length === 0 && (
              <div className={styles.emptyState}>No record entries committed to target database.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
