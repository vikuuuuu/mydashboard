"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { logToolUsage } from "@/lib/firestore";
import {
  collection, getDocs, query, where, addDoc, updateDoc,
  deleteDoc, doc, serverTimestamp, orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getCurrentUser } from "@/lib/firebaseAuth";
import styles from "./myfinancials.module.css";
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend,
  CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler,
} from "chart.js";
import { Doughnut, Bar, Line } from "react-chartjs-2";

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler);

const CHARGE_FIELDS = {
  BUY: [
    { key: "brokerage", label: "Brokerage" },
    { key: "exchangeCharges", label: "Exch. Transaction Charges" },
    { key: "gst", label: "GST" },
    { key: "stampDuty", label: "Stamp Duty" },
  ],
  SELL: [
    { key: "growwDpCharges", label: "Groww DP Charges" },
    { key: "brokerage", label: "Brokerage" },
    { key: "exchangeCharges", label: "Exch. Transaction Charges" },
    { key: "stt", label: "STT" },
    { key: "cdslDpCharges", label: "CDSL DP Charges" },
    { key: "gst", label: "GST" },
  ],
};
const ALL_CHARGE_KEYS = ["brokerage","exchangeCharges","gst","stampDuty","stt","cdslDpCharges","growwDpCharges"];
const EMPTY_STOCK_FORM = { symbol:"",companyName:"",stockType:"Equity",qty:"",price:"",action:"BUY",date:"",brokerage:"",exchangeCharges:"",gst:"",stampDuty:"",stt:"",cdslDpCharges:"",growwDpCharges:"",id:null };
const EXPENSE_CATEGORIES = [
  { id:"food",label:"🍔 Food & Dining",color:"#f77f00" },
  { id:"transport",label:"🚗 Transport",color:"#4361ee" },
  { id:"bills",label:"⚡ Bills & Utilities",color:"#e63946" },
  { id:"shopping",label:"🛍️ Shopping",color:"#9b5de5" },
  { id:"health",label:"💊 Health",color:"#06d6a0" },
  { id:"entertainment",label:"🎬 Entertainment",color:"#f15bb5" },
  { id:"education",label:"📚 Education",color:"#00bbf9" },
  { id:"rent",label:"🏠 Rent/EMI",color:"#3a86ff" },
  { id:"investment",label:"💰 Investment",color:"#0f9d6e" },
  { id:"other",label:"📦 Other",color:"#aab4d4" },
];
const EMPTY_KHATA_FORM = { type:"EXPENSE",amount:"",category:"other",description:"",contactName:"",date:"",notes:"",id:null };
const CHART_COLORS = ["#4361ee","#0f9d6e","#f77f00","#e63946","#3a86ff","#9b5de5","#f15bb5","#00bbf9","#06d6a0","#ffd166"];
const sumAllCharges = (t) => ALL_CHARGE_KEYS.reduce((s,k) => s+Number(t[k]||0),0);

export default function FinancialsPage() {
  const [user,setUser] = useState(null);
  const [activeModule,setActiveModule] = useState("portfolio");
  const [transactions,setTransactions] = useState([]);
  const [khataEntries,setKhataEntries] = useState([]);
  const [loading,setLoading] = useState(true);
  const [stockForm,setStockForm] = useState(EMPTY_STOCK_FORM);
  const [stockModalOpen,setStockModalOpen] = useState(false);
  const [stockFormError,setStockFormError] = useState("");
  const [khataForm,setKhataForm] = useState(EMPTY_KHATA_FORM);
  const [khataModalOpen,setKhataModalOpen] = useState(false);
  const stockModalRef = useRef(null);
  const khataModalRef = useRef(null);
  const router = useRouter();

  useEffect(() => {
    const u = getCurrentUser();
    if(u){ setUser(u); fetchStockData(u.uid); fetchKhataData(u.uid); }
    setLoading(false);
  },[]);

  useEffect(() => {
    const h = (e) => { if(e.key==="Escape"){ closeStockModal(); closeKhataModal(); }};
    window.addEventListener("keydown",h);
    return () => window.removeEventListener("keydown",h);
  },[]);

  const fetchStockData = async(uid) => {
    const q = query(collection(db,"transactions"),where("userId","==",uid),orderBy("createdAt","asc"));
    const snap = await getDocs(q);
    setTransactions(snap.docs.map(d=>({id:d.id,...d.data()})));
  };
  const fetchKhataData = async(uid) => {
    const q = query(collection(db,"khataEntries"),where("userId","==",uid),orderBy("createdAt","desc"));
    const snap = await getDocs(q);
    setKhataEntries(snap.docs.map(d=>({id:d.id,...d.data()})));
  };

  const holdings = useMemo(() => {
    const map = {};
    transactions.forEach(tx => {
      const qty=Number(tx.qty),price=Number(tx.price),charges=sumAllCharges(tx);
      if(!map[tx.symbol]) map[tx.symbol]={companyName:tx.companyName,lots:[],qty:0,invested:0,realized:0,totalCharges:0};
      const s=map[tx.symbol]; s.totalCharges+=charges;
      if(tx.action==="BUY"){s.lots.push({qty,price});s.qty+=qty;s.invested+=qty*price;}
      if(tx.action==="SELL"){
        let rem=qty;
        while(rem>0&&s.lots.length>0){
          const lot=s.lots[0];
          if(lot.qty<=rem){s.realized+=lot.qty*(price-lot.price);s.invested-=lot.qty*lot.price;rem-=lot.qty;s.qty-=lot.qty;s.lots.shift();}
          else{s.realized+=rem*(price-lot.price);s.invested-=rem*lot.price;lot.qty-=rem;s.qty-=rem;rem=0;}
        }
      }
    });
    return Object.entries(map).map(([symbol,data])=>({symbol,...data}));
  },[transactions]);

  const totals = useMemo(()=>holdings.reduce((acc,h)=>{
    if(h.qty>0){acc.currentInvest+=h.invested;acc.totalStocks+=1;}
    acc.totalPL+=h.realized;acc.totalCharges+=h.totalCharges;return acc;
  },{currentInvest:0,totalPL:0,totalStocks:0,totalCharges:0}),[holdings]);

  const totalInvest = transactions.filter(t=>t.action==="BUY").reduce((s,t)=>s+Number(t.qty)*Number(t.price),0);
  const totalChargesAll = transactions.reduce((s,t)=>s+sumAllCharges(t),0);
  const netPL = totals.totalPL-totalChargesAll;

  const khataStats = useMemo(()=>{
    const totalExpense=khataEntries.filter(e=>e.type==="EXPENSE").reduce((s,e)=>s+Number(e.amount),0);
    const totalGiven=khataEntries.filter(e=>e.type==="PAYMENT_GIVEN").reduce((s,e)=>s+Number(e.amount),0);
    const totalReceived=khataEntries.filter(e=>e.type==="PAYMENT_RECEIVED").reduce((s,e)=>s+Number(e.amount),0);
    const byCat={};
    khataEntries.filter(e=>e.type==="EXPENSE").forEach(e=>{ byCat[e.category]=(byCat[e.category]||0)+Number(e.amount); });
    const byContact={};
    khataEntries.filter(e=>e.type==="PAYMENT_GIVEN"||e.type==="PAYMENT_RECEIVED").forEach(e=>{
      if(!e.contactName)return;
      if(!byContact[e.contactName])byContact[e.contactName]={given:0,received:0};
      if(e.type==="PAYMENT_GIVEN")byContact[e.contactName].given+=Number(e.amount);
      else byContact[e.contactName].received+=Number(e.amount);
    });
    const byMonth={};
    khataEntries.forEach(e=>{
      const d=new Date(e.createdAt?.seconds?e.createdAt.seconds*1000:e.createdAt);
      const key=d.toLocaleDateString("en-IN",{month:"short",year:"2-digit"});
      if(!byMonth[key])byMonth[key]={expense:0,given:0,received:0};
      if(e.type==="EXPENSE")byMonth[key].expense+=Number(e.amount);
      else if(e.type==="PAYMENT_GIVEN")byMonth[key].given+=Number(e.amount);
      else byMonth[key].received+=Number(e.amount);
    });
    return{totalExpense,totalGiven,totalReceived,byCat,byContact,byMonth,netBalance:totalReceived-totalGiven};
  },[khataEntries]);

  const companyList = useMemo(()=>{ const m={}; transactions.forEach(t=>{m[t.symbol]=t.companyName;}); return m; },[transactions]);
  const closeStockModal=()=>{ setStockModalOpen(false);setStockForm(EMPTY_STOCK_FORM);setStockFormError(""); };
  const closeKhataModal=()=>{ setKhataModalOpen(false);setKhataForm(EMPTY_KHATA_FORM); };

  const saveStock = async(e)=>{
    e.preventDefault(); setStockFormError("");
    const symbol=stockForm.symbol.toUpperCase(),qty=Number(stockForm.qty),price=Number(stockForm.price);
    if(stockForm.action==="SELL"){ const h=holdings.find(h=>h.symbol===symbol); if(!h||qty>h.qty){setStockFormError("Not enough stock to sell!");return;} }
    const chargePayload={};
    ALL_CHARGE_KEYS.forEach(k=>{ chargePayload[k]=CHARGE_FIELDS[stockForm.action].some(f=>f.key===k)?Number(stockForm[k]||0):0; });
    const payload={symbol,companyName:stockForm.companyName,stockType:stockForm.stockType,qty,price,action:stockForm.action,...chargePayload,createdAt:stockForm.date?new Date(stockForm.date):serverTimestamp()};
    if(stockForm.id)await updateDoc(doc(db,"transactions",stockForm.id),payload);
    else await addDoc(collection(db,"transactions"),{userId:user.uid,...payload});
    closeStockModal(); fetchStockData(user.uid);
    if(user)await logToolUsage({userId:user.uid,tool:stockForm.id?"My Financials - Edit Trade":"My Financials - Add Trade"});
  };

  const deleteStock=async(id)=>{ if(!window.confirm("Delete this trade?"))return; await deleteDoc(doc(db,"transactions",id)); fetchStockData(user.uid); };
  const editStock=(t)=>{ setStockForm({symbol:t.symbol,companyName:t.companyName,stockType:t.stockType,qty:t.qty,price:t.price,action:t.action,brokerage:t.brokerage||"",exchangeCharges:t.exchangeCharges||"",gst:t.gst||"",stampDuty:t.stampDuty||"",stt:t.stt||"",cdslDpCharges:t.cdslDpCharges||"",growwDpCharges:t.growwDpCharges||"",date:t.createdAt?.seconds?new Date(t.createdAt.seconds*1000).toISOString().slice(0,16):t.createdAt,id:t.id}); setStockFormError(""); setStockModalOpen(true); };

  const saveKhata=async(e)=>{ e.preventDefault(); const payload={type:khataForm.type,amount:Number(khataForm.amount),category:khataForm.category,description:khataForm.description,contactName:khataForm.contactName,notes:khataForm.notes,createdAt:khataForm.date?new Date(khataForm.date):serverTimestamp()}; if(khataForm.id)await updateDoc(doc(db,"khataEntries",khataForm.id),payload); else await addDoc(collection(db,"khataEntries"),{userId:user.uid,...payload}); closeKhataModal(); fetchKhataData(user.uid); if(user)await logToolUsage({userId:user.uid,tool:"My Financials - Khata Entry"}); };
  const deleteKhata=async(id)=>{ if(!window.confirm("Delete this entry?"))return; await deleteDoc(doc(db,"khataEntries",id)); fetchKhataData(user.uid); };
  const editKhata=(e)=>{ setKhataForm({type:e.type,amount:e.amount,category:e.category||"other",description:e.description,contactName:e.contactName||"",notes:e.notes||"",date:e.createdAt?.seconds?new Date(e.createdAt.seconds*1000).toISOString().slice(0,16):e.createdAt,id:e.id}); setKhataModalOpen(true); };

  const formatDate=(ca)=>{ const d=new Date(ca?.seconds?ca.seconds*1000:ca); return d.toLocaleString("en-IN",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}); };
  const fmtVal=(v)=>Number(v)>0?`₹${Number(v).toLocaleString("en-IN",{minimumFractionDigits:2})}`:null;

  const activeHoldings=holdings.filter(h=>h.qty>0);
  const maxInvested=Math.max(...activeHoldings.map(h=>h.invested),1);
  const plHoldings=holdings.filter(h=>Math.abs(h.realized)>0);
  const byMonthStock={};
  transactions.forEach(t=>{ const d=new Date(t.createdAt?.seconds?t.createdAt.seconds*1000:t.createdAt); const k=d.toLocaleDateString("en-IN",{month:"short",year:"2-digit"}); if(!byMonthStock[k])byMonthStock[k]={buy:0,sell:0}; const v=Number(t.qty)*Number(t.price); if(t.action==="BUY")byMonthStock[k].buy+=v; else byMonthStock[k].sell+=v; });
  const chargeKeys=["brokerage","exchangeCharges","gst","stampDuty","stt","cdslDpCharges","growwDpCharges"];
  const chargeLabels=["Brokerage","Exch.Charges","GST","Stamp Duty","STT","CDSL DP","Groww DP"];
  const chargeFiltered=chargeKeys.map((k,i)=>({label:chargeLabels[i],val:transactions.reduce((s,t)=>s+Number(t[k]||0),0),color:CHART_COLORS[i]})).filter(c=>c.val>0);
  const contactList=Object.entries(khataStats.byContact);

  const chartOpts={responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}};
  const barOpts={...chartOpts,scales:{y:{ticks:{callback:v=>"₹"+Math.round(v)},grid:{color:"rgba(99,120,200,0.07)"}},x:{grid:{display:false}}}};
  const barOptsLegend={...barOpts,plugins:{legend:{display:true,labels:{font:{size:11},boxWidth:10}}}};
  const formChargesTotal=CHARGE_FIELDS[stockForm.action].reduce((s,f)=>s+Number(stockForm[f.key]||0),0);

  if(loading)return <div className={styles.loader}>Loading portfolio…</div>;

  return (
    <div className={styles.container}>
      <button className={styles.backBtn} onClick={()=>router.back()}>← Back</button>
      <h1 className={styles.pageTitle}>💼 My Financials</h1>

      {/* MODULE SWITCHER */}
      <div className={styles.moduleSwitcher}>
        <button className={`${styles.moduleBtn} ${activeModule==="portfolio"?styles.moduleBtnActive:""}`} onClick={()=>setActiveModule("portfolio")}>
          <span className={styles.moduleIcon}>📈</span>
          <div><div className={styles.moduleBtnTitle}>Portfolio Manager</div><div className={styles.moduleBtnSub}>Stocks · P&L · Holdings · Charts</div></div>
        </button>
        <button className={`${styles.moduleBtn} ${activeModule==="khata"?styles.moduleBtnActiveGreen:""}`} onClick={()=>setActiveModule("khata")}>
          <span className={styles.moduleIcon}>📒</span>
          <div><div className={styles.moduleBtnTitle}>Khata Book</div><div className={styles.moduleBtnSub}>Expenses · Payments · Ledger · Analytics</div></div>
        </button>
      </div>

      {/* ══════ PORTFOLIO ══════ */}
      {activeModule==="portfolio" && (<>
        <div className={styles.kpiGrid}>
          {[
            {label:"Total Invested",value:`₹${totalInvest.toLocaleString("en-IN")}`,mod:""},
            {label:"Current Value",value:`₹${totals.currentInvest.toLocaleString("en-IN")}`,mod:""},
            {label:"Realised P&L",value:`${totals.totalPL>=0?"+":""}₹${totals.totalPL.toLocaleString("en-IN")}`,mod:totals.totalPL>=0?styles.cardPositive:styles.cardNegative,color:totals.totalPL>=0?"var(--buy)":"var(--sell)"},
            {label:"Total Charges",value:`−₹${totalChargesAll.toLocaleString("en-IN",{minimumFractionDigits:2})}`,mod:styles.cardCharges,color:"var(--charges)"},
            {label:"Net P&L (after charges)",value:`${netPL>=0?"+":""}₹${netPL.toLocaleString("en-IN")}`,mod:netPL>=0?styles.cardPositive:styles.cardNegative,color:netPL>=0?"var(--buy)":"var(--sell)"},
            {label:"Active Positions",value:totals.totalStocks,mod:""},
          ].map(({label,value,mod,color})=>(
            <div key={label} className={`${styles.card} ${mod}`}><span>{label}</span><h2 style={color?{color}:{}}>{value}</h2></div>
          ))}
        </div>
        <button className={styles.addTradeBtn} onClick={()=>{setStockForm(EMPTY_STOCK_FORM);setStockModalOpen(true);}}>➕ Add Trade</button>
        <div className={styles.sectionHeader}><span>📊 Analytics Dashboard</span></div>
        <div className={styles.chartsGrid}>
          <div className={styles.chartCard}>
            <div className={styles.chartTitle}>Portfolio Allocation</div>
            {activeHoldings.length>0?(<><div className={styles.chartWrap}><Doughnut data={{labels:activeHoldings.map(h=>h.symbol),datasets:[{data:activeHoldings.map(h=>h.invested),backgroundColor:CHART_COLORS.slice(0,activeHoldings.length),borderWidth:2,borderColor:"#fff"}]}} options={chartOpts} /></div><div className={styles.chartLegend}>{activeHoldings.map((h,i)=><span key={h.symbol} className={styles.legendItem}><span className={styles.legendDot} style={{background:CHART_COLORS[i]}} />{h.symbol}</span>)}</div></>):<div className={styles.chartEmpty}>No active holdings</div>}
          </div>
          <div className={styles.chartCard}>
            <div className={styles.chartTitle}>Realized P&L by Stock</div>
            {plHoldings.length>0?<div className={styles.chartWrap}><Bar data={{labels:plHoldings.map(h=>h.symbol),datasets:[{label:"Realized P&L",data:plHoldings.map(h=>h.realized),backgroundColor:plHoldings.map(h=>h.realized>=0?"rgba(15,157,110,0.75)":"rgba(230,57,70,0.75)"),borderRadius:6}]}} options={barOpts} /></div>:<div className={styles.chartEmpty}>No realized P&L yet</div>}
          </div>
          <div className={`${styles.chartCard} ${styles.chartCardWide}`}>
            <div className={styles.chartTitle}>Trade Activity Timeline</div>
            {Object.keys(byMonthStock).length>0?(<div className={`${styles.chartWrap} ${styles.chartWrapLg}`}><Line data={{labels:Object.keys(byMonthStock),datasets:[{label:"Buy",data:Object.values(byMonthStock).map(m=>m.buy),borderColor:"#0f9d6e",backgroundColor:"rgba(15,157,110,0.08)",fill:true,tension:0.4,borderWidth:2,pointRadius:4,pointBackgroundColor:"#0f9d6e"},{label:"Sell",data:Object.values(byMonthStock).map(m=>m.sell),borderColor:"#e63946",backgroundColor:"rgba(230,57,70,0.08)",fill:true,tension:0.4,borderWidth:2,pointRadius:4,pointBackgroundColor:"#e63946"}]}} options={barOptsLegend} /></div>):<div className={styles.chartEmpty}>No trades yet</div>}
          </div>
          <div className={styles.chartCard}>
            <div className={styles.chartTitle}>Charges Breakdown</div>
            {chargeFiltered.length>0?(<><div className={styles.chartWrap}><Doughnut data={{labels:chargeFiltered.map(c=>c.label),datasets:[{data:chargeFiltered.map(c=>c.val),backgroundColor:chargeFiltered.map(c=>c.color),borderWidth:2,borderColor:"#fff"}]}} options={chartOpts} /></div><div className={styles.chartLegend}>{chargeFiltered.map(c=><span key={c.label} className={styles.legendItem}><span className={styles.legendDot} style={{background:c.color}} />{c.label}</span>)}</div></>):<div className={styles.chartEmpty}>No charges</div>}
          </div>
          <div className={styles.chartCard}>
            <div className={styles.chartTitle}>Buy vs Sell Volume</div>
            <div className={styles.chartWrap}><Bar data={{labels:["Buy Volume","Sell Volume"],datasets:[{data:[transactions.filter(t=>t.action==="BUY").reduce((s,t)=>s+Number(t.qty)*Number(t.price),0),transactions.filter(t=>t.action==="SELL").reduce((s,t)=>s+Number(t.qty)*Number(t.price),0)],backgroundColor:["rgba(15,157,110,0.75)","rgba(230,57,70,0.75)"],borderRadius:8}]}} options={barOpts} /></div>
          </div>
        </div>
        {activeHoldings.length>0&&(<>
          <div className={styles.sectionHeader}><span>📂 Active Holdings</span></div>
          <div className={styles.holdingsGrid}>
            {activeHoldings.map(h=>{
              const avg=h.qty>0?h.invested/h.qty:0;
              return(<div key={h.symbol} className={styles.holdingCard}>
                <div className={styles.holdingSymbol}>{h.symbol}</div>
                <div className={styles.holdingName}>{h.companyName}</div>
                <div className={styles.holdingMeta}>
                  <div><div className={styles.holdingQtyLabel}>Qty</div><div className={styles.holdingQtyVal}>{h.qty}</div><div className={styles.holdingAvg}>Avg ₹{avg.toLocaleString("en-IN",{minimumFractionDigits:2})}</div></div>
                  <div className={`${styles.holdingPL} ${h.realized>=0?styles.holdingPLPos:styles.holdingPLNeg}`}>{h.realized>=0?"+":""}₹{h.realized.toLocaleString("en-IN",{minimumFractionDigits:2})}<div className={styles.holdingPLLabel}>Realized P&L</div></div>
                </div>
                <div className={styles.holdingInvested}>Invested: ₹{h.invested.toLocaleString("en-IN",{minimumFractionDigits:2})}</div>
                <div className={styles.holdingBar}><div className={styles.holdingBarFill} style={{width:`${Math.min(100,(h.invested/maxInvested)*100)}%`}} /></div>
              </div>);
            })}
          </div>
        </>)}
        <StockTable transactions={transactions} holdings={holdings} editTrade={editStock} deleteTrade={deleteStock} formatDate={formatDate} fmtVal={fmtVal} sumAllCharges={sumAllCharges} />
      </>)}

      {/* ══════ KHATA ══════ */}
      {activeModule==="khata"&&(<>
        <div className={styles.kpiGrid}>
          <div className={`${styles.card} ${styles.cardNegative}`}><span>Total Expenses</span><h2 style={{color:"var(--sell)"}}>₹{khataStats.totalExpense.toLocaleString("en-IN")}</h2></div>
          <div className={`${styles.card} ${styles.cardCharges}`}><span>Payment Given</span><h2 style={{color:"var(--charges)"}}>₹{khataStats.totalGiven.toLocaleString("en-IN")}</h2></div>
          <div className={`${styles.card} ${styles.cardPositive}`}><span>Payment Received</span><h2 style={{color:"var(--buy)"}}>₹{khataStats.totalReceived.toLocaleString("en-IN")}</h2></div>
          <div className={`${styles.card} ${khataStats.netBalance>=0?styles.cardPositive:styles.cardNegative}`}><span>Net Balance (Recv − Given)</span><h2 style={{color:khataStats.netBalance>=0?"var(--buy)":"var(--sell)"}}>{khataStats.netBalance>=0?"+":""}₹{khataStats.netBalance.toLocaleString("en-IN")}</h2></div>
          <div className={styles.card}><span>Total Entries</span><h2>{khataEntries.length}</h2></div>
          <div className={styles.card}><span>Contacts</span><h2>{Object.keys(khataStats.byContact).length}</h2></div>
        </div>
        <button className={styles.addTradeBtn} style={{background:"var(--buy)"}} onClick={()=>{setKhataForm(EMPTY_KHATA_FORM);setKhataModalOpen(true);}}>➕ Add Entry</button>
        <div className={styles.sectionHeader}><span>📊 Khata Analytics</span></div>
        <div className={styles.chartsGrid}>
          <div className={styles.chartCard}>
            <div className={styles.chartTitle}>Expense by Category</div>
            {Object.keys(khataStats.byCat).length>0?(<><div className={styles.chartWrap}><Doughnut data={{labels:Object.keys(khataStats.byCat).map(k=>EXPENSE_CATEGORIES.find(c=>c.id===k)?.label||k),datasets:[{data:Object.values(khataStats.byCat),backgroundColor:Object.keys(khataStats.byCat).map(k=>EXPENSE_CATEGORIES.find(c=>c.id===k)?.color||"#aaa"),borderWidth:2,borderColor:"#fff"}]}} options={chartOpts} /></div><div className={styles.chartLegend}>{Object.keys(khataStats.byCat).map(k=>{const cat=EXPENSE_CATEGORIES.find(c=>c.id===k);return <span key={k} className={styles.legendItem}><span className={styles.legendDot} style={{background:cat?.color||"#aaa"}} />{cat?.label?.split(" ").slice(1).join(" ")||k}</span>;})}</div></>):<div className={styles.chartEmpty}>No expenses yet</div>}
          </div>
          <div className={`${styles.chartCard} ${styles.chartCardWide}`}>
            <div className={styles.chartTitle}>Monthly Overview — Expense / Given / Received</div>
            {Object.keys(khataStats.byMonth).length>0?<div className={`${styles.chartWrap} ${styles.chartWrapLg}`}><Line data={{labels:Object.keys(khataStats.byMonth),datasets:[{label:"Expense",data:Object.values(khataStats.byMonth).map(m=>m.expense),borderColor:"#e63946",backgroundColor:"rgba(230,57,70,0.08)",fill:true,tension:0.4,borderWidth:2},{label:"Given",data:Object.values(khataStats.byMonth).map(m=>m.given),borderColor:"#f77f00",backgroundColor:"rgba(247,127,0,0.06)",fill:true,tension:0.4,borderWidth:2},{label:"Received",data:Object.values(khataStats.byMonth).map(m=>m.received),borderColor:"#0f9d6e",backgroundColor:"rgba(15,157,110,0.06)",fill:true,tension:0.4,borderWidth:2}]}} options={barOptsLegend} /></div>:<div className={styles.chartEmpty}>No data yet</div>}
          </div>
          {contactList.length>0&&<div className={`${styles.chartCard} ${styles.chartCardWide}`}>
            <div className={styles.chartTitle}>Contact-wise Payment Ledger</div>
            <div className={`${styles.chartWrap} ${styles.chartWrapLg}`}><Bar data={{labels:contactList.map(([n])=>n),datasets:[{label:"Given",data:contactList.map(([,v])=>v.given),backgroundColor:"rgba(230,57,70,0.7)",borderRadius:5},{label:"Received",data:contactList.map(([,v])=>v.received),backgroundColor:"rgba(15,157,110,0.7)",borderRadius:5}]}} options={barOptsLegend} /></div>
          </div>}
        </div>
        {contactList.length>0&&(<>
          <div className={styles.sectionHeader}><span>👥 Contact Ledger</span></div>
          <div className={styles.holdingsGrid}>
            {contactList.map(([name,v])=>{
              const net=v.received-v.given;
              return(<div key={name} className={styles.holdingCard}>
                <div className={styles.holdingSymbol}>👤 {name}</div>
                <div className={styles.holdingMeta} style={{marginTop:10}}>
                  <div><div className={styles.holdingQtyLabel}>Given</div><div className={styles.holdingQtyVal} style={{color:"var(--sell)",fontSize:15}}>₹{v.given.toLocaleString("en-IN")}</div></div>
                  <div style={{textAlign:"right"}}><div className={styles.holdingQtyLabel}>Received</div><div className={styles.holdingQtyVal} style={{color:"var(--buy)",fontSize:15}}>₹{v.received.toLocaleString("en-IN")}</div></div>
                </div>
                <div className={styles.holdingInvested} style={{marginTop:8}}>Net: <strong style={{color:net>=0?"var(--buy)":"var(--sell)"}}>{net>=0?"+":""}₹{net.toLocaleString("en-IN")}</strong><span style={{fontSize:11,color:"var(--text2)",marginLeft:6}}>{net>=0?"(they owe you)":"(you owe them)"}</span></div>
              </div>);
            })}
          </div>
        </>)}
        <KhataTable entries={khataEntries} editEntry={editKhata} deleteEntry={deleteKhata} formatDate={formatDate} />
      </>)}

      {/* STOCK MODAL */}
      {stockModalOpen&&(
        <div className={styles.modalOverlay} onClick={e=>{if(stockModalRef.current&&!stockModalRef.current.contains(e.target))closeStockModal();}}>
          <div className={styles.modal} ref={stockModalRef}>
            <div className={styles.modalHeader}><span className={styles.modalTitle}>{stockForm.id?"✏️ Edit Trade":"➕ Add Trade"}</span><button className={styles.modalClose} onClick={closeStockModal}>✕</button></div>
            {stockFormError&&<div className={styles.formAlert}>{stockFormError}</div>}
            <form onSubmit={saveStock}>
              <div className={styles.formRow}>
                <div className={styles.formGroup}><label>Symbol</label><input list="symbolList" placeholder="e.g. INFY" value={stockForm.symbol} onChange={e=>{const v=e.target.value.toUpperCase();setStockForm({...stockForm,symbol:v,companyName:companyList[v]||""});}} required /><datalist id="symbolList">{Object.keys(companyList).map(s=><option key={s} value={s}/>)}</datalist></div>
                <div className={styles.formGroup}><label>Company Name</label><input placeholder="Company Name" value={stockForm.companyName} onChange={e=>setStockForm({...stockForm,companyName:e.target.value})} required /></div>
                <div className={styles.formGroup}><label>Type</label><select value={stockForm.stockType} onChange={e=>setStockForm({...stockForm,stockType:e.target.value})}><option>Equity</option><option>ETF</option><option>Crypto</option></select></div>
                <div className={styles.formGroup}><label>Action</label><select value={stockForm.action} onChange={e=>setStockForm({...stockForm,action:e.target.value})} className={stockForm.action==="BUY"?styles.selectBuy:styles.selectSell}><option value="BUY">BUY</option><option value="SELL">SELL</option></select></div>
                <div className={styles.formGroup}><label>Quantity</label><input type="number" placeholder="0" value={stockForm.qty} onChange={e=>setStockForm({...stockForm,qty:e.target.value})} required /></div>
                <div className={styles.formGroup}><label>Price (₹)</label><input type="number" placeholder="0.00" value={stockForm.price} onChange={e=>setStockForm({...stockForm,price:e.target.value})} required /></div>
                <div className={styles.formGroup}><label>Date & Time</label><input type="datetime-local" value={stockForm.date} onChange={e=>setStockForm({...stockForm,date:e.target.value})} /></div>
              </div>
              <div className={styles.chargesDivider}><span className={stockForm.action==="BUY"?styles.chargesLabelBuy:styles.chargesLabelSell}>💸 {stockForm.action==="BUY"?"BUY Charges":"SELL Charges"} (optional)</span></div>
              <div className={styles.chargesHelp}>{stockForm.action==="BUY"?"Applicable: Brokerage · Exchange Transaction Charges · GST · Stamp Duty":"Applicable: Brokerage · Exchange Transaction Charges · STT · CDSL DP Charges · GST"}</div>
              <div className={styles.formRow}>
                {CHARGE_FIELDS[stockForm.action].map(field=><div className={styles.formGroup} key={field.key}><label>{field.label} (₹)</label><input type="number" placeholder="0.00" value={stockForm[field.key]} onChange={e=>setStockForm({...stockForm,[field.key]:e.target.value})} /></div>)}
                {formChargesTotal>0&&<div className={styles.chargesPreview}><span>Total Charges</span><strong>₹{formChargesTotal.toLocaleString("en-IN",{minimumFractionDigits:2})}</strong></div>}
              </div>
              <div className={styles.formActions}><button type="button" className={styles.cancelBtn} onClick={closeStockModal}>Cancel</button><button type="submit" className={styles.submitBtn}>{stockForm.id?"Update Trade":"Add Trade"}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* KHATA MODAL */}
      {khataModalOpen&&(
        <div className={styles.modalOverlay} onClick={e=>{if(khataModalRef.current&&!khataModalRef.current.contains(e.target))closeKhataModal();}}>
          <div className={styles.modal} ref={khataModalRef}>
            <div className={styles.modalHeader}><span className={styles.modalTitle}>{khataForm.id?"✏️ Edit Entry":"➕ Add Khata Entry"}</span><button className={styles.modalClose} onClick={closeKhataModal}>✕</button></div>
            <form onSubmit={saveKhata}>
              <div className={styles.khataTypeRow}>
                {[{val:"EXPENSE",label:"💸 Expense",cls:styles.khataTypeExpense},{val:"PAYMENT_GIVEN",label:"🔴 Payment Given",cls:styles.khataTypeGiven},{val:"PAYMENT_RECEIVED",label:"🟢 Payment Received",cls:styles.khataTypeReceived}].map(({val,label,cls})=>(
                  <button type="button" key={val} className={`${styles.khataTypeBtn} ${khataForm.type===val?cls:""}`} onClick={()=>setKhataForm({...khataForm,type:val})}>{label}</button>
                ))}
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}><label>Amount (₹)</label><input type="number" placeholder="0.00" value={khataForm.amount} onChange={e=>setKhataForm({...khataForm,amount:e.target.value})} required /></div>
                <div className={styles.formGroup}><label>Description</label><input placeholder={khataForm.type==="EXPENSE"?"e.g. Lunch at Dhaba":"e.g. Rent to Ramesh"} value={khataForm.description} onChange={e=>setKhataForm({...khataForm,description:e.target.value})} required /></div>
                {khataForm.type==="EXPENSE"&&<div className={styles.formGroup}><label>Category</label><select value={khataForm.category} onChange={e=>setKhataForm({...khataForm,category:e.target.value})}>{EXPENSE_CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></div>}
                {(khataForm.type==="PAYMENT_GIVEN"||khataForm.type==="PAYMENT_RECEIVED")&&<div className={styles.formGroup}><label>Contact Name</label><input placeholder="Person / Company name" value={khataForm.contactName} onChange={e=>setKhataForm({...khataForm,contactName:e.target.value})} required /></div>}
                <div className={styles.formGroup}><label>Date & Time</label><input type="datetime-local" value={khataForm.date} onChange={e=>setKhataForm({...khataForm,date:e.target.value})} /></div>
                <div className={`${styles.formGroup} ${styles.formGroupWide}`}><label>Notes (optional)</label><input placeholder="Extra notes…" value={khataForm.notes} onChange={e=>setKhataForm({...khataForm,notes:e.target.value})} /></div>
              </div>
              <div className={styles.formActions}><button type="button" className={styles.cancelBtn} onClick={closeKhataModal}>Cancel</button><button type="submit" className={styles.submitBtn}>{khataForm.id?"Update Entry":"Add Entry"}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StockTable({transactions,holdings,editTrade,deleteTrade,formatDate,fmtVal,sumAllCharges}){
  const [tab,setTab]=useState("ALL");
  const [search,setSearch]=useState("");
  const [dateFrom,setDateFrom]=useState("");
  const [dateTo,setDateTo]=useState("");
  const [sortKey,setSortKey]=useState("date");
  const [sortDir,setSortDir]=useState("desc");
  const filtered=useMemo(()=>{
    let list=[...transactions];
    if(tab!=="ALL")list=list.filter(t=>t.action===tab);
    if(search.trim()){const q=search.toLowerCase();list=list.filter(t=>t.companyName?.toLowerCase().includes(q)||t.symbol?.toLowerCase().includes(q));}
    if(dateFrom){const f=new Date(dateFrom);list=list.filter(t=>new Date(t.createdAt?.seconds?t.createdAt.seconds*1000:t.createdAt)>=f);}
    if(dateTo){const to=new Date(dateTo);to.setHours(23,59,59,999);list=list.filter(t=>new Date(t.createdAt?.seconds?t.createdAt.seconds*1000:t.createdAt)<=to);}
    list.sort((a,b)=>{
      let va,vb;
      if(sortKey==="date"){va=a.createdAt?.seconds||new Date(a.createdAt).getTime()/1000;vb=b.createdAt?.seconds||new Date(b.createdAt).getTime()/1000;}
      else if(sortKey==="name"){va=a.companyName?.toLowerCase();vb=b.companyName?.toLowerCase();}
      else if(sortKey==="symbol"){va=a.symbol?.toLowerCase();vb=b.symbol?.toLowerCase();}
      else if(sortKey==="qty"){va=Number(a.qty);vb=Number(b.qty);}
      else if(sortKey==="value"){va=Number(a.qty)*Number(a.price);vb=Number(b.qty)*Number(b.price);}
      if(va<vb)return sortDir==="asc"?-1:1;
      if(va>vb)return sortDir==="asc"?1:-1;
      return 0;
    });
    return list;
  },[transactions,tab,search,dateFrom,dateTo,sortKey,sortDir]);
  const toggleSort=(key)=>{if(sortKey===key)setSortDir(d=>d==="asc"?"desc":"asc");else{setSortKey(key);setSortDir("asc");}};
  const sortIcon=(key)=>sortKey!==key?<span className={styles.sortNeutral}>⇅</span>:sortDir==="asc"?<span className={styles.sortActive}>↑</span>:<span className={styles.sortActive}>↓</span>;
  const exportCSV=()=>{
    const headers=["Action","Company","Symbol","Type","Qty","Price","Trade Value","Brokerage","Exch.Charges","GST","Stamp Duty","Groww DP","STT","CDSL DP","Total Charges","Net Amount","Date"];
    const rows=filtered.map(t=>{const ch=sumAllCharges(t),tv=Number(t.qty)*Number(t.price),net=t.action==="BUY"?tv+ch:tv-ch,d=new Date(t.createdAt?.seconds?t.createdAt.seconds*1000:t.createdAt);return[t.action,t.companyName,t.symbol,t.stockType,t.qty,t.price,tv.toFixed(2),t.brokerage||0,t.exchangeCharges||0,t.gst||0,t.stampDuty||0,t.growwDpCharges||0,t.stt||0,t.cdslDpCharges||0,ch.toFixed(2),net.toFixed(2),d.toLocaleDateString("en-IN")];});
    const csv=[headers,...rows].map(r=>r.map(v=>`"${v}"`).join(",")).join("\n");
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download=`trades_${Date.now()}.csv`;a.click();
  };
  return(
    <div className={styles.tableWrapper}>
      <div className={styles.tableTopBar}>
        <div className={styles.tabGroup}>
          <button className={`${styles.tabBtn} ${tab==="ALL"?styles.tabAll:""}`} onClick={()=>setTab("ALL")}>All <span className={styles.tabCount}>{transactions.length}</span></button>
          <button className={`${styles.tabBtn} ${tab==="BUY"?styles.tabBuyActive:""}`} onClick={()=>setTab("BUY")}>🟢 Buy <span className={styles.tabCount}>{transactions.filter(t=>t.action==="BUY").length}</span></button>
          <button className={`${styles.tabBtn} ${tab==="SELL"?styles.tabSellActive:""}`} onClick={()=>setTab("SELL")}>🔴 Sell <span className={styles.tabCount}>{transactions.filter(t=>t.action==="SELL").length}</span></button>
        </div>
        <button className={styles.exportBtn} onClick={exportCSV}>↓ Export CSV</button>
      </div>
      <div className={styles.filterBar}>
        <div className={styles.filterSearch}><span>🔍</span><input className={styles.filterInput} placeholder="Search company or symbol…" value={search} onChange={e=>setSearch(e.target.value)} />{search&&<button className={styles.filterClear} onClick={()=>setSearch("")}>✕</button>}</div>
        <div className={styles.filterDateGroup}><label className={styles.filterLabel}>From</label><input type="date" className={styles.filterDate} value={dateFrom} onChange={e=>setDateFrom(e.target.value)} /></div>
        <div className={styles.filterDateGroup}><label className={styles.filterLabel}>To</label><input type="date" className={styles.filterDate} value={dateTo} onChange={e=>setDateTo(e.target.value)} /></div>
        <div className={styles.filterSortGroup}><label className={styles.filterLabel}>Sort</label><select className={styles.filterSelect} value={sortKey} onChange={e=>{setSortKey(e.target.value);setSortDir("asc");}}><option value="date">Date</option><option value="name">Company</option><option value="symbol">Symbol</option><option value="qty">Qty</option><option value="value">Value</option></select><button className={styles.sortDirBtn} onClick={()=>setSortDir(d=>d==="asc"?"desc":"asc")}>{sortDir==="asc"?"↑ Asc":"↓ Desc"}</button></div>
        {(search||dateFrom||dateTo)&&<button className={styles.clearAllBtn} onClick={()=>{setSearch("");setDateFrom("");setDateTo("");}}>Clear All</button>}
        <span className={styles.resultCount}>{filtered.length} of {transactions.length}</span>
      </div>
      <div className={styles.scrollTable}>
        <table className={styles.table}>
          <thead><tr>
            <th></th><th onClick={()=>toggleSort("name")} className={styles.thSort}>Company {sortIcon("name")}</th><th onClick={()=>toggleSort("symbol")} className={styles.thSort}>Symbol {sortIcon("symbol")}</th><th>Type</th>{tab==="ALL"&&<th>Action</th>}<th onClick={()=>toggleSort("qty")} className={styles.thSort}>Qty {sortIcon("qty")}</th><th>Price</th><th onClick={()=>toggleSort("value")} className={styles.thSort}>Trade Value {sortIcon("value")}</th>
            {(tab==="ALL"||tab==="BUY")&&<><th className={styles.thBuy}>Brokerage</th><th className={styles.thBuy}>Exch.</th><th className={styles.thBuy}>GST</th><th className={styles.thBuy}>Stamp</th></>}
            {(tab==="ALL"||tab==="SELL")&&<><th className={styles.thSell}>Groww DP</th><th className={styles.thSell}>STT</th><th className={styles.thSell}>CDSL DP</th><th className={styles.thSell}>GST</th></>}
            <th className={styles.thCharges}>Charges</th><th className={styles.thFinal}>Net</th><th onClick={()=>toggleSort("date")} className={styles.thSort}>Date {sortIcon("date")}</th><th>Actions</th>
          </tr></thead>
          <tbody>
            {filtered.map((t,i)=>{const ch=sumAllCharges(t),tv=Number(t.qty)*Number(t.price),net=t.action==="BUY"?tv+ch:tv-ch,isBuy=t.action==="BUY";return(
              <tr key={i}>
                <td>{isBuy?"🟢":"🔴"}</td><td>{t.companyName}</td><td className={styles.monoCell}>{t.symbol}</td><td>{t.stockType}</td>{tab==="ALL"&&<td><span className={isBuy?styles.badgeBuy:styles.badgeSell}>{t.action}</span></td>}<td className={styles.monoCell}>{t.qty}</td><td className={styles.monoCell}>₹{Number(t.price).toLocaleString("en-IN",{minimumFractionDigits:2})}</td><td className={styles.monoCell}>₹{tv.toLocaleString("en-IN",{minimumFractionDigits:2})}</td>
                {(tab==="ALL"||tab==="BUY")&&<><td className={`${styles.monoCell} ${styles.buyCol}`}>{isBuy?(fmtVal(t.brokerage)||<span className={styles.nilCell}>—</span>):<span className={styles.naCell}>N/A</span>}</td><td className={`${styles.monoCell} ${styles.buyCol}`}>{isBuy?(fmtVal(t.exchangeCharges)||<span className={styles.nilCell}>—</span>):<span className={styles.naCell}>N/A</span>}</td><td className={`${styles.monoCell} ${styles.buyCol}`}>{isBuy?(fmtVal(t.gst)||<span className={styles.nilCell}>—</span>):<span className={styles.naCell}>N/A</span>}</td><td className={`${styles.monoCell} ${styles.buyCol}`}>{isBuy?(fmtVal(t.stampDuty)||<span className={styles.nilCell}>—</span>):<span className={styles.naCell}>N/A</span>}</td></>}
                {(tab==="ALL"||tab==="SELL")&&<><td className={`${styles.monoCell} ${styles.sellCol}`}>{!isBuy?(fmtVal(t.growwDpCharges)||<span className={styles.nilCell}>—</span>):<span className={styles.naCell}>N/A</span>}</td><td className={`${styles.monoCell} ${styles.sellCol}`}>{!isBuy?(fmtVal(t.stt)||<span className={styles.nilCell}>—</span>):<span className={styles.naCell}>N/A</span>}</td><td className={`${styles.monoCell} ${styles.sellCol}`}>{!isBuy?(fmtVal(t.cdslDpCharges)||<span className={styles.nilCell}>—</span>):<span className={styles.naCell}>N/A</span>}</td><td className={`${styles.monoCell} ${styles.sellCol}`}>{!isBuy?(fmtVal(t.gst)||<span className={styles.nilCell}>—</span>):<span className={styles.naCell}>N/A</span>}</td></>}
                <td className={`${styles.monoCell} ${styles.chargesCell}`}>{ch>0?`₹${ch.toLocaleString("en-IN",{minimumFractionDigits:2})}`:<span className={styles.nilCell}>—</span>}</td><td className={`${styles.monoCell} ${styles.finalCell}`}>₹{net.toLocaleString("en-IN",{minimumFractionDigits:2})}</td><td className={styles.dateCell}>{formatDate(t.createdAt)}</td><td style={{whiteSpace:"nowrap"}}><button className={styles.editBtn} onClick={()=>editTrade(t)}>Edit</button><button className={styles.deleteBtn} onClick={()=>deleteTrade(t.id)}>Delete</button></td>
              </tr>
            );})}
            {filtered.length===0&&<tr><td colSpan={20} className={styles.emptyRow}>{transactions.length===0?"No trades yet. Click 'Add Trade' to get started.":"No records match filters."}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KhataTable({entries,editEntry,deleteEntry,formatDate}){
  const [tab,setTab]=useState("ALL");
  const [search,setSearch]=useState("");
  const filtered=useMemo(()=>{let list=[...entries];if(tab!=="ALL")list=list.filter(e=>e.type===tab);if(search.trim()){const q=search.toLowerCase();list=list.filter(e=>e.description?.toLowerCase().includes(q)||e.contactName?.toLowerCase().includes(q));}return list;},[entries,tab,search]);
  const typeLabel=(type)=>{if(type==="EXPENSE")return <span className={styles.badgeExpense}>💸 Expense</span>;if(type==="PAYMENT_GIVEN")return <span className={styles.badgeGiven}>🔴 Given</span>;return <span className={styles.badgeReceived}>🟢 Received</span>;};
  const exportCSV=()=>{const headers=["Type","Amount","Description","Category","Contact","Notes","Date"];const rows=filtered.map(e=>{const d=new Date(e.createdAt?.seconds?e.createdAt.seconds*1000:e.createdAt);return[e.type,e.amount,e.description,e.category||"",e.contactName||"",e.notes||"",d.toLocaleDateString("en-IN")];});const csv=[headers,...rows].map(r=>r.map(v=>`"${v}"`).join(",")).join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download=`khata_${Date.now()}.csv`;a.click();};
  return(
    <div className={styles.tableWrapper}>
      <div className={styles.tableTopBar}>
        <div className={styles.tabGroup}>
          <button className={`${styles.tabBtn} ${tab==="ALL"?styles.tabAll:""}`} onClick={()=>setTab("ALL")}>All <span className={styles.tabCount}>{entries.length}</span></button>
          <button className={`${styles.tabBtn} ${tab==="EXPENSE"?styles.tabExpenseActive:""}`} onClick={()=>setTab("EXPENSE")}>💸 Expense <span className={styles.tabCount}>{entries.filter(e=>e.type==="EXPENSE").length}</span></button>
          <button className={`${styles.tabBtn} ${tab==="PAYMENT_GIVEN"?styles.tabSellActive:""}`} onClick={()=>setTab("PAYMENT_GIVEN")}>🔴 Given <span className={styles.tabCount}>{entries.filter(e=>e.type==="PAYMENT_GIVEN").length}</span></button>
          <button className={`${styles.tabBtn} ${tab==="PAYMENT_RECEIVED"?styles.tabBuyActive:""}`} onClick={()=>setTab("PAYMENT_RECEIVED")}>🟢 Received <span className={styles.tabCount}>{entries.filter(e=>e.type==="PAYMENT_RECEIVED").length}</span></button>
        </div>
        <button className={styles.exportBtn} onClick={exportCSV}>↓ Export CSV</button>
      </div>
      <div className={styles.filterBar}>
        <div className={styles.filterSearch}><span>🔍</span><input className={styles.filterInput} placeholder="Search description or contact…" value={search} onChange={e=>setSearch(e.target.value)} />{search&&<button className={styles.filterClear} onClick={()=>setSearch("")}>✕</button>}</div>
        <span className={styles.resultCount}>{filtered.length} of {entries.length}</span>
      </div>
      <div className={styles.scrollTable}>
        <table className={styles.table}>
          <thead><tr><th>Type</th><th>Amount</th><th>Description</th><th>Category</th><th>Contact</th><th>Notes</th><th>Date</th><th>Actions</th></tr></thead>
          <tbody>
            {filtered.map((e,i)=>{const cat=EXPENSE_CATEGORIES.find(c=>c.id===e.category);return(
              <tr key={i}>
                <td>{typeLabel(e.type)}</td>
                <td className={styles.monoCell} style={{color:e.type==="PAYMENT_RECEIVED"?"var(--buy)":e.type==="PAYMENT_GIVEN"?"var(--charges)":"var(--sell)",fontWeight:600}}>{e.type==="PAYMENT_RECEIVED"?"+":"-"}₹{Number(e.amount).toLocaleString("en-IN",{minimumFractionDigits:2})}</td>
                <td>{e.description}</td>
                <td>{cat?<span className={styles.catPill} style={{background:cat.color+"22",color:cat.color,border:`1px solid ${cat.color}44`}}>{cat.label}</span>:<span className={styles.nilCell}>—</span>}</td>
                <td>{e.contactName||<span className={styles.nilCell}>—</span>}</td>
                <td style={{color:"var(--text2)",fontSize:12}}>{e.notes||<span className={styles.nilCell}>—</span>}</td>
                <td className={styles.dateCell}>{formatDate(e.createdAt)}</td>
                <td style={{whiteSpace:"nowrap"}}><button className={styles.editBtn} onClick={()=>editEntry(e)}>Edit</button><button className={styles.deleteBtn} onClick={()=>deleteEntry(e.id)}>Delete</button></td>
              </tr>
            );})}
            {filtered.length===0&&<tr><td colSpan={8} className={styles.emptyRow}>{entries.length===0?"No entries yet. Click 'Add Entry' to get started.":"No records match filters."}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
