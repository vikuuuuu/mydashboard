
"use client";
import { useState, useCallback } from "react";

const CURRENCIES = [
  { symbol: "₹", label: "INR - Indian Rupee" },
  { symbol: "$", label: "USD - US Dollar" },
  { symbol: "€", label: "EUR - Euro" },
  { symbol: "£", label: "GBP - British Pound" },
];

const STATUS_STYLES = {
  Pending: { bg: "#fff8e8", color: "#854F0B" },
  Paid:    { bg: "#e8f5ee", color: "#2d6a4f" },
  Overdue: { bg: "#fef0f0", color: "#A32D2D" },
  Draft:   { bg: "#f0f0f0", color: "#444" },
};

let _id = 0;
const newItem = (desc = "", qty = 1, rate = 0) => ({ id: _id++, desc, qty, rate });

const formatDate = (d) => {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${day} ${months[parseInt(m) - 1]} ${y}`;
};

const toISO = (d) => d.toISOString().split("T")[0];
const today = toISO(new Date());
const due7  = toISO(new Date(Date.now() + 7 * 86400000));

export default function InvoiceGenerator() {
  const [form, setForm] = useState({
    invNo: "INV-001", date: today, due: due7,
    currency: "₹", status: "Pending",
    fromName: "", fromTag: "", fromDetail: "",
    toName: "", toDetail: "",
    tax: 18, disc: 0, ship: 0,
    bank: "", notes: "", thanks: "Thank you for your business!",
  });
  const [items, setItems] = useState([
    newItem("Web Design Services", 1, 15000),
    newItem("Monthly Maintenance", 1, 3000),
  ]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const addItem = () => setItems((prev) => [...prev, newItem()]);
  const removeItem = (id) => setItems((prev) => prev.filter((i) => i.id !== id));
  const updateItem = (id, field, val) =>
    setItems((prev) =>
      prev.map((i) => i.id === id ? { ...i, [field]: field === "desc" ? val : parseFloat(val) || 0 } : i)
    );

  const subtotal = items.reduce((s, i) => s + i.qty * i.rate, 0);
  const discAmt  = subtotal * form.disc / 100;
  const afterDisc = subtotal - discAmt;
  const taxAmt   = afterDisc * form.tax / 100;
  const total    = afterDisc + taxAmt + (parseFloat(form.ship) || 0);

  const fmt = useCallback(
    (n) => form.currency + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    [form.currency]
  );

  const handlePrint = () => {
    const el = document.getElementById("inv-paper");
    const w = window.open("", "_blank");
    w.document.write(`
      <html><head><title>Invoice-${form.invNo}</title>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet">
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:'Outfit',sans-serif;padding:40px;color:#0f0f0f}
        .mono{font-family:'DM Mono',monospace}
        .serif{font-family:'DM Serif Display',serif}
        @media print{body{padding:0}}
      </style></head>
      <body>${el.innerHTML}</body></html>
    `);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 600);
  };

  // ── Input helpers ──
  const inp = "w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-amber-400 bg-white";
  const lbl = "block text-xs text-gray-500 font-medium mb-1";

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", background: "#fafaf7", minHeight: "100vh" }}>

      {/* TOP BAR */}
      <div style={{ background: "#1a1a2e", color: "#fff", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "#c8a96e", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15, color: "#1a1a2e" }}>M</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500 }}>Invoice Generator</div>
            <div style={{ fontSize: 11, opacity: 0.5 }}>MyDashboard</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn onClick={() => { if (confirm("Reset?")) { setForm({ invNo:"INV-001",date:today,due:due7,currency:"₹",status:"Pending",fromName:"",fromTag:"",fromDetail:"",toName:"",toDetail:"",tax:18,disc:0,ship:0,bank:"",notes:"",thanks:"Thank you for your business!" }); setItems([newItem()]); } }}>↺ Reset</Btn>
          <Btn gold onClick={handlePrint}>⬇ Print / Download PDF</Btn>
        </div>
      </div>

      {/* MAIN GRID */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", minHeight: "calc(100vh - 61px)" }}>

        {/* ── FORM PANEL ── */}
        <div style={{ padding: "24px 28px", borderRight: "1px solid #e5e5e5", overflowY: "auto" }}>

          <SectionHead>Invoice Details</SectionHead>
          <Row3>
            <Field label="Invoice No."><input className={inp} value={form.invNo} onChange={e => set("invNo", e.target.value)} /></Field>
            <Field label="Invoice Date"><input className={inp} type="date" value={form.date} onChange={e => set("date", e.target.value)} /></Field>
            <Field label="Due Date"><input className={inp} type="date" value={form.due} onChange={e => set("due", e.target.value)} /></Field>
          </Row3>
          <Row2>
            <Field label="Currency">
              <select className={inp} value={form.currency} onChange={e => set("currency", e.target.value)}>
                {CURRENCIES.map(c => <option key={c.symbol} value={c.symbol}>{c.symbol} {c.label}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select className={inp} value={form.status} onChange={e => set("status", e.target.value)}>
                {Object.keys(STATUS_STYLES).map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </Row2>

          <SectionHead>Your Business (From)</SectionHead>
          <Field label="Business / Your Name" full><input className={inp} placeholder="Rahul Enterprises" value={form.fromName} onChange={e => set("fromName", e.target.value)} /></Field>
          <Field label="Tagline (optional)" full><input className={inp} placeholder="Web Design & Development" value={form.fromTag} onChange={e => set("fromTag", e.target.value)} /></Field>
          <Field label="Address / Contact" full><textarea className={inp} rows={3} placeholder={"123, MG Road, Jaipur\n+91 98765 43210\nrahul@example.com"} value={form.fromDetail} onChange={e => set("fromDetail", e.target.value)} /></Field>

          <SectionHead>Client (Bill To)</SectionHead>
          <Field label="Client Name / Company" full><input className={inp} placeholder="ABC Pvt Ltd" value={form.toName} onChange={e => set("toName", e.target.value)} /></Field>
          <Field label="Client Address / Contact" full><textarea className={inp} rows={3} placeholder={"456, Civil Lines, Delhi\nclient@example.com"} value={form.toDetail} onChange={e => set("toDetail", e.target.value)} /></Field>

          <SectionHead>Items / Services</SectionHead>
          <div style={{ display: "grid", gridTemplateColumns: "3fr 60px 90px 90px 32px", gap: 8, padding: "6px 0", borderBottom: "1px solid #e5e5e5", fontSize: 11, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            <span>Description</span><span style={{textAlign:"center"}}>Qty</span><span style={{textAlign:"right"}}>Rate</span><span style={{textAlign:"right"}}>Amount</span><span/>
          </div>
          {items.map(item => (
            <div key={item.id} style={{ display: "grid", gridTemplateColumns: "3fr 60px 90px 90px 32px", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #f5f5f5" }}>
              <input className={inp} value={item.desc} placeholder="Service description" onChange={e => updateItem(item.id, "desc", e.target.value)} />
              <input className={inp} type="number" value={item.qty} min={1} style={{textAlign:"center"}} onChange={e => updateItem(item.id, "qty", e.target.value)} />
              <input className={inp} type="number" value={item.rate} min={0} style={{textAlign:"right"}} onChange={e => updateItem(item.id, "rate", e.target.value)} />
              <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: "#555", textAlign: "right", padding: "0 4px" }}>{fmt(item.qty * item.rate)}</div>
              <button onClick={() => removeItem(item.id)} style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #e5e5e5", background: "transparent", cursor: "pointer", color: "#cc4444", fontSize: 18, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>
          ))}
          <button onClick={addItem} style={{ marginTop: 10, width: "100%", padding: "8px", borderRadius: 8, border: "1.5px dashed #ddd", background: "transparent", fontSize: 13, color: "#999", cursor: "pointer" }}>+ Add Item</button>

          <SectionHead>Tax & Discount</SectionHead>
          <Row3>
            <Field label="GST / Tax (%)"><input className={inp} type="number" value={form.tax} min={0} max={100} onChange={e => set("tax", e.target.value)} /></Field>
            <Field label="Discount (%)"><input className={inp} type="number" value={form.disc} min={0} max={100} onChange={e => set("disc", e.target.value)} /></Field>
            <Field label="Shipping (₹)"><input className={inp} type="number" value={form.ship} min={0} onChange={e => set("ship", e.target.value)} /></Field>
          </Row3>

          <SectionHead>Payment & Notes</SectionHead>
          <Field label="Bank / UPI Details" full><textarea className={inp} rows={4} placeholder={"Bank: SBI\nA/C: 12345678\nIFSC: SBIN0000123\nUPI: rahul@upi"} value={form.bank} onChange={e => set("bank", e.target.value)} /></Field>
          <Field label="Notes / Terms" full><textarea className={inp} rows={2} placeholder="Payment due within 7 days." value={form.notes} onChange={e => set("notes", e.target.value)} /></Field>
          <Field label="Thank You Message" full><input className={inp} value={form.thanks} onChange={e => set("thanks", e.target.value)} /></Field>

        </div>

        {/* ── PREVIEW PANEL ── */}
        <div style={{ background: "#e8e8e4", padding: "24px 20px", overflowY: "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "#888", textAlign: "center", marginBottom: 16 }}>Live Preview</div>

          {/* INVOICE PAPER */}
          <div id="inv-paper" style={{ background: "#fff", borderRadius: 4, padding: "40px 36px", boxShadow: "0 4px 24px rgba(0,0,0,0.1)", position: "relative", overflow: "hidden" }}>
            {/* accent bar */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 5, background: "linear-gradient(90deg,#1a1a2e,#c8a96e)" }} />

            {/* header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
              <div>
                <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, color: "#1a1a2e" }}>{form.fromName || "Your Business"}</div>
                {form.fromTag && <div style={{ fontSize: 11, color: "#999", marginTop: 3 }}>{form.fromTag}</div>}
                <div style={{ fontSize: 11, color: "#555", marginTop: 6, lineHeight: 1.7, whiteSpace: "pre-line" }}>{form.fromDetail}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 22, fontWeight: 300, letterSpacing: "0.08em", textTransform: "uppercase", color: "#1a1a2e" }}>Invoice</div>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: "#999", marginTop: 4 }}>#{form.invNo}</div>
                <div style={{ fontSize: 11, color: "#555", marginTop: 6, lineHeight: 1.8 }}>
                  <span style={{color:"#999"}}>Date: </span>{formatDate(form.date)}<br/>
                  <span style={{color:"#999"}}>Due: </span>{formatDate(form.due)}
                </div>
                <div style={{ display: "inline-block", marginTop: 6, padding: "2px 10px", borderRadius: 20, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", background: STATUS_STYLES[form.status]?.bg, color: STATUS_STYLES[form.status]?.color }}>{form.status}</div>
              </div>
            </div>

            <hr style={{ border: "none", borderTop: "1px solid #eee", margin: "0 0 20px" }} />

            {/* parties */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
              {[["From", form.fromName, form.fromDetail], ["Bill To", form.toName, form.toDetail]].map(([lbl, name, detail]) => (
                <div key={lbl}>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "#c8a96e", marginBottom: 5 }}>{lbl}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0f0f0f", marginBottom: 3 }}>{name || "—"}</div>
                  <div style={{ fontSize: 11, color: "#555", lineHeight: 1.7, whiteSpace: "pre-line" }}>{detail}</div>
                </div>
              ))}
            </div>

            {/* items */}
            <div style={{ display: "grid", gridTemplateColumns: "3fr 44px 72px 72px", gap: 6, padding: "6px 0", borderBottom: "2px solid #1a1a2e", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#888" }}>
              <span>Description</span><span style={{textAlign:"right"}}>Qty</span><span style={{textAlign:"right"}}>Rate</span><span style={{textAlign:"right"}}>Amount</span>
            </div>
            {items.length === 0
              ? <div style={{ padding: "12px 0", fontSize: 12, color: "#bbb", textAlign: "center" }}>No items</div>
              : items.map(item => (
                <div key={item.id} style={{ display: "grid", gridTemplateColumns: "3fr 44px 72px 72px", gap: 6, padding: "7px 0", borderBottom: "1px solid #f5f5f5", fontSize: 11 }}>
                  <span style={{ fontWeight: 500 }}>{item.desc || "Item"}</span>
                  <span style={{ fontFamily:"'DM Mono',monospace", textAlign:"right", color:"#666" }}>{item.qty}</span>
                  <span style={{ fontFamily:"'DM Mono',monospace", textAlign:"right", color:"#666" }}>{fmt(item.rate)}</span>
                  <span style={{ fontFamily:"'DM Mono',monospace", textAlign:"right", color:"#666" }}>{fmt(item.qty*item.rate)}</span>
                </div>
              ))
            }

            {/* totals */}
            <div style={{ marginTop: 12, marginLeft: "auto", maxWidth: 200 }}>
              {[
                ["Subtotal", fmt(subtotal), true],
                form.disc > 0 ? [`Discount (${form.disc}%)`, `- ${fmt(discAmt)}`, true] : null,
                [`GST (${form.tax}%)`, fmt(taxAmt), true],
                parseFloat(form.ship) > 0 ? ["Shipping", fmt(form.ship), true] : null,
              ].filter(Boolean).map(([k,v]) => (
                <div key={k} style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#666", padding:"4px 0" }}>
                  <span>{k}</span><span style={{fontFamily:"'DM Mono',monospace"}}>{v}</span>
                </div>
              ))}
              <div style={{ display:"flex", justifyContent:"space-between", borderTop:"2px solid #1a1a2e", marginTop:6, paddingTop:10, fontSize:14, fontWeight:600, color:"#1a1a2e" }}>
                <span>Total</span><span style={{fontFamily:"'DM Mono',monospace",fontSize:16}}>{fmt(total)}</span>
              </div>
            </div>

            {/* footer */}
            <div style={{ marginTop: 28, borderTop: "1px solid #eee", paddingTop: 18 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#aaa", marginBottom: 5 }}>Payment Details</div>
                  <div style={{ fontSize: 11, color: "#555", lineHeight: 1.7, whiteSpace: "pre-line" }}>{form.bank || "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#aaa", marginBottom: 5 }}>Notes & Terms</div>
                  <div style={{ fontSize: 11, color: "#555", lineHeight: 1.7 }}>{form.notes || "—"}</div>
                </div>
              </div>
              <div style={{ textAlign: "center", marginTop: 20, fontFamily: "'DM Serif Display',serif", fontStyle: "italic", fontSize: 13, color: "#c8a96e" }}>{form.thanks}</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Small helper components ──
function SectionHead({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#aaa", margin: "20px 0 10px", paddingBottom: 8, borderBottom: "1px solid #eee" }}>{children}</div>;
}
function Field({ label, children, full }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: full ? 10 : 0 }}>
      <label style={{ fontSize: 12, color: "#666", fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  );
}
function Row2({ children }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>{children}</div>;
}
function Row3({ children }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 10 }}>{children}</div>;
}
function Btn({ children, onClick, gold }) {
  return (
    <button onClick={onClick} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: gold ? "#c8a96e" : "rgba(255,255,255,0.12)", color: gold ? "#1a1a2e" : "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
      {children}
    </button>
  );
}
