"use client";

import React, { useState, useEffect } from "react";
// Replace this import with your actual firebase initialized reference file path
// import { db } from "@/lib/firebaseConfig"; 
// import { collection, addDoc, getDocs, serverTimestamp } from "firebase/firestore";

export default function MilkDairyManagement() {
  // UI Tabs & Functional States
  const [activeTab, setActiveTab] = useState("entries"); // entries | register | records
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  // System Database Simulation fallbacks (in case config isn't linked yet)
  const [customers, setCustomers] = useState([
    { id: "153", name: "Bhuli devi", phone: "9116591816", village: "Dhambiwal" },
    { id: "102", name: "Ramesh Kumar", phone: "9876543210", village: "Jaipur" }
  ]);
  const [entries, setEntries] = useState([
    { id: "e1", name: "Bhuli devi", customerId: "153", date: "2026-05-25", shift: "E", fat: 3.80, snf: 8.50, liters: 4.00, rate: 40.25, total: 161.0, cmFund: 20.0, finalAmount: 141.0 }
  ]);

  // Form State: Collection Entries
  const [entryForm, setEntryForm] = useState({
    customerId: "",
    date: new Date().toISOString().split('T')[0],
    shift: "M",
    liters: "",
    fat: "",
    snf: "8.50", // Standard baseline
    cmFund: "20.0"
  });

  // Form State: Customer Registration
  const [customerForm, setCustomerForm] = useState({
    id: "",
    name: "",
    phone: "",
    village: ""
  });

  // Derived Analytics Data
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
    const s = parseFloat(snf) || 0;
    const l = parseFloat(liters) || 0;
    
    // Baseline configuration setup based on structural fat measurements
    const baseRatePerFat = 10.592; 
    const calculatedRate = parseFloat((f * baseRatePerFat).toFixed(2));
    const rawTotal = parseFloat((calculatedRate * l).toFixed(2));
    return { rate: calculatedRate, total: rawTotal };
  };

  // Operational Action: Add Milk Entry Transaction
  const handleAddEntry = async (e) => {
    e.preventDefault();
    if (!entryForm.customerId || !entryForm.liters || !entryForm.fat) {
      showToast("Please fill all mandatory configuration fields.", "error");
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
      // Firebase Database Integration Execution Node:
      // const docRef = await addDoc(collection(db, "milk_entries"), itemPayload);
      
      // Reactive local state tracking deployment verification
      setEntries([ { id: Math.random().toString(), ...itemPayload }, ...entries]);
      showToast("Collection Record committed to ledger!");

      // Execute WhatsApp Integration Message Trigger
      if (selectedCustomer && selectedCustomer.phone) {
        triggerWhatsAppNotification(selectedCustomer, itemPayload);
      }

      // Form reset execution layout
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
      showToast("Database synchronization verification failed.", "error");
    } finally {
      setLoading(false);
    }
  };

  // Operational Action: Register New Customer Card profile
  const handleRegisterCustomer = async (e) => {
    e.preventDefault();
    if (!customerForm.id || !customerForm.name || !customerForm.phone) {
      showToast("Please verify primary details are correctly provided.", "error");
      return;
    }

    setLoading(true);
    try {
      // Firebase Database Integration Execution Node:
      // await addDoc(collection(db, "customers"), customerForm);

      setCustomers([...customers, customerForm]);
      showToast(`Customer account profile [${customerForm.name}] generated successfully.`);
      setCustomerForm({ id: "", name: "", phone: "", village: "" });
      setActiveTab("entries"); // Shift layout view context back to operations
    } catch (err) {
      console.error("Firebase Registration Error: ", err);
      showToast("Customer configuration sync faulted.", "error");
    } finally {
      setLoading(false);
    }
  };

  // Feature: Automated WhatsApp Direct Notification Despatch Routing
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

    // Standard country format validation configuration check mapping
    let activePhone = customer.phone.trim();
    if (!activePhone.startsWith("91") && activePhone.length === 10) {
      activePhone = "91" + activePhone;
    }

    const targetUrl = `https://api.whatsapp.com/send?phone=${activePhone}&text=${formattedMessage}`;
    window.open(targetUrl, "_blank");
  };

  return (
    <div className="page">
      {/* Toast Alert View Node element template wrapper */}
      {toast.show && (
        <div className={`toast toast_${toast.type}`}>
          {toast.message}
        </div>
      )}

      {/* Top Header Grid Interface Section Layout configuration */}
      <div className="topBar">
        <div className="titleArea">
          <h1 className="title">
            Dairy Management Ledger <span className="vBadge">v2.4 Live</span>
          </h1>
          <p className="subtitle">Real-time automation matrix for supply optimization logistics tracking.</p>
        </div>
        <div className="leftControls">
          <button className="controlBtnLive">
            <span className="pulseIcon">●</span> SYSTEM ONLINE
          </button>
        </div>
      </div>

      {/* Operational Dashboard Core Summary Layout Metric Panel Widgets */}
      <div className="statsGrid">
        <div className="statCard">
          <span className="statIcon">🥛</span>
          <div>
            <span className="statValue">{totalLitersCollected.toFixed(2)} L</span>
            <span className="statLabel">Total Volume Collected</span>
          </div>
        </div>
        <div className="statCard">
          <span className="statIcon">📊</span>
          <div>
            <span className="statValue">{averageFatQuality} %</span>
            <span className="statLabel">Mean Fat Index</span>
          </div>
        </div>
        <div className="statCard">
          <span className="statIcon">💸</span>
          <div>
            <span className="statValue">Rs {totalPayoutGenerated.toFixed(2)}</span>
            <span className="statLabel">Net Disbursed Funds</span>
          </div>
        </div>
        <div className="statCard">
          <span className="statIcon">👥</span>
          <div>
            <span className="statValue">{customers.length}</span>
            <span className="statLabel">Active Registered Producers</span>
          </div>
        </div>
      </div>

      {/* Main Tab Management Navigation Interface Selector */}
      <div className="tabNav">
        <button className={`tabBtn ${activeTab === "entries" ? "tabActive" : ""}`} onClick={() => setActiveTab("entries")}>
          📥 Log Supply Delivery
        </button>
        <button className={`tabBtn ${activeTab === "register" ? "tabActive" : ""}`} onClick={() => setActiveTab("register")}>
          👤 Provision New Account
        </button>
        <button className={`tabBtn ${activeTab === "records" ? "tabActive" : ""}`} onClick={() => setActiveTab("records")}>
          📋 Historic Delivery Matrices
        </button>
      </div>

      {/* Content Rendering Evaluation Block Router switches */}
      {activeTab === "entries" && (
        <div className="notesGrid">
          <div className="card">
            <div className="cardHead">
              <span>📝</span>
              <h2>Log Inbound Yield Delivery</h2>
            </div>
            
            <form onSubmit={handleAddEntry} className="studySetupForm">
              <div className="advancedForm">
                <div style={{ flex: 1, minWidth: "200px" }}>
                  <label className="repeatLabel">Select Producer Account Profile</label>
                  <select 
                    className="formSelect" 
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
                  <label className="repeatLabel">Shift Window</label>
                  <select 
                    className="formSelect"
                    value={entryForm.shift}
                    onChange={(e) => setEntryForm({...entryForm, shift: e.target.value})}
                  >
                    <option value="M">☀️ Morning (M)</option>
                    <option value="E">🌙 Evening (E)</option>
                  </select>
                </div>
              </div>

              <div className="timetableForm">
                <input 
                  type="date" 
                  className="formInput" 
                  value={entryForm.date} 
                  onChange={(e) => setEntryForm({...entryForm, date: e.target.value})} 
                />
                <input 
                  type="number" 
                  step="0.01" 
                  placeholder="Quantity (Liters)" 
                  className="formInput"
                  value={entryForm.liters}
                  onChange={(e) => setEntryForm({...entryForm, liters: e.target.value})}
                />
                <input 
                  type="number" 
                  step="0.01" 
                  placeholder="Fat Content %" 
                  className="formInput"
                  value={entryForm.fat}
                  onChange={(e) => setEntryForm({...entryForm, fat: e.target.value})}
                />
              </div>

              <div className="timetableForm">
                <input 
                  type="number" 
                  step="0.01" 
                  placeholder="SNF Baseline %" 
                  className="formInput"
                  value={entryForm.snf}
                  onChange={(e) => setEntryForm({...entryForm, snf: e.target.value})}
                />
                <input 
                  type="number" 
                  step="0.01" 
                  placeholder="CM Fund Charge" 
                  className="formInput"
                  value={entryForm.cmFund}
                  onChange={(e) => setEntryForm({...entryForm, cmFund: e.target.value})}
                />
              </div>

              <button type="submit" className="startModeBtn" disabled={loading}>
                🚀 Commit Entry & Send WhatsApp Notification
              </button>
            </form>
          </div>

          {/* Real-time Dynamic Context preview matching receipt analysis design metrics */}
          <div className="card activeStudyPulse">
            <div className="cardHead">
              <span>🧾</span>
              <h2>Real-Time Live Voucher Preview</h2>
            </div>
            <div className="liveConsoleArea">
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
              <p className="sessionNoteDisplay">Voucher recalculates instantaneously relative to baseline modifications change loops.</p>
            </div>
          </div>
        </div>
      )}

      {activeTab === "register" && (
        <div className="card" style={{ maxWidth: "600px", margin: "0 auto" }}>
          <div className="cardHead">
            <span>👤</span>
            <h2>Register New Dairy Producer Account</h2>
          </div>
          <form onSubmit={handleRegisterCustomer} className="studySetupForm">
            <div className="advancedForm">
              <input 
                type="text" 
                placeholder="Unique Account Code / Card ID (e.g., 153)" 
                className="formInput"
                value={customerForm.id}
                onChange={(e) => setCustomerForm({...customerForm, id: e.target.value})}
              />
            </div>
            <div className="advancedForm">
              <input 
                type="text" 
                placeholder="Producer's Full Legal Name" 
                className="formInput"
                value={customerForm.name}
                onChange={(e) => setCustomerForm({...customerForm, name: e.target.value})}
              />
            </div>
            <div className="advancedForm">
              <input 
                type="text" 
                placeholder="WhatsApp Phone Number (with Country Code e.g. 91...)" 
                className="formInput"
                value={customerForm.phone}
                onChange={(e) => setCustomerForm({...customerForm, phone: e.target.value})}
              />
            </div>
            <div className="advancedForm">
              <input 
                type="text" 
                placeholder="Village / Collection Center Locale" 
                className="formInput"
                value={customerForm.village}
                onChange={(e) => setCustomerForm({...customerForm, village: e.target.value})}
              />
            </div>
            <button type="submit" className="addBtn" style={{ width: "100%", padding: "12px" }} disabled={loading}>
              🔒 Authorize Ledger Allocation Profile
            </button>
          </form>
        </div>
      )}

      {activeTab === "records" && (
        <div className="card">
          <div className="cardHead">
            <span>📋</span>
            <h2>Historic Transaction Ledger Database Logs</h2>
            <div className="resultCount">{entries.length} Transaction Records committed</div>
          </div>
          <div className="taskList">
            {entries.map((item) => (
              <div key={item.id} className="taskCard">
                <div className="taskInfo">
                  <div className="taskTop">
                    <span className="typeBadge">Shift: {item.shift}</span>
                    <span className="dayBadge">{item.date}</span>
                    <span className="liveTag" style={{ background: "var(--accent)" }}>ID: {item.customerId}</span>
                  </div>
                  <h3>{item.name}</h3>
                  <p>
                    Volume Delivery: <strong>{item.liters} Liters</strong> | Fat Level: {item.fat}% | SNF: {item.snf}%
                  </p>
                  <p className="taskNote">
                    Gross Calculation base: Rs {item.rate}/L → Total: Rs {item.total} [CM Fund Deduction: Rs {item.cmFund}]
                  </p>
                </div>
                <div className="taskActions">
                  <span className="goodScore">Rs {item.finalAmount}</span>
                </div>
              </div>
            ))}
            {entries.length === 0 && (
              <div className="emptyState">No record entries committed to target Firebase reference nodes.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
