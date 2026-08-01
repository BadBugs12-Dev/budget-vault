import React, {useState} from "react";
import {createRoot} from "react-dom/client";
import {motion} from "framer-motion";
import "./style.css";

function App(){
 const [money,setMoney]=useState(Number(localStorage.getItem("money")||0));
 const [goals,setGoals]=useState(JSON.parse(localStorage.getItem("goals")||"[]"));
 const [amount,setAmount]=useState("");

 function update(v){
   const n=Math.max(0,money+v);
   setMoney(n); localStorage.setItem("money",n);
 }
 function addGoal(){
   const name=prompt("Goal name?");
   const target=Number(prompt("Target amount?"));
   if(name&&target){
    const g=[...goals,{name,target,saved:0}];
    setGoals(g); localStorage.setItem("goals",JSON.stringify(g));
   }
 }
 function saveGoal(i){
   const amt=Number(prompt("Move how much into goal?"));
   let g=[...goals];
   amt<=money && (g[i].saved+=amt, update(-amt));
   setGoals(g); localStorage.setItem("goals",JSON.stringify(g));
 }

 return <main>
  <motion.h1 initial={{scale:.8}} animate={{scale:1}}>🏦 Budget Vault</motion.h1>
  <motion.div className="card" whileHover={{scale:1.03}}>
    <h2>${money.toFixed(2)}</h2>
    <input value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Amount 25.50"/>
    <button onClick={()=>{update(Number(amount));setAmount("")}}>➕ Add</button>
    <button onClick={()=>{update(-Number(amount));setAmount("")}}>➖ Spend</button>
  </motion.div>
  <section className="card">
   <h2>🎯 Goals</h2>
   <button onClick={addGoal}>New Goal</button>
   {goals.map((g,i)=><div key={i}>
    <b>{g.name}</b> ${g.saved.toFixed(2)} / ${g.target.toFixed(2)}
    <div className="bar"><span style={{width:`${Math.min(100,g.saved/g.target*100)}%`}}/></div>
    <button onClick={()=>saveGoal(i)}>Save</button>
   </div>)}
  </section>
 </main>
}
createRoot(document.getElementById("root")).render(<App/>);