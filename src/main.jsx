import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { motion } from "framer-motion";
import "./style.css";

const STORAGE_KEY = "money-hq-data-v1";
const categories = [
  { id: "treat", label: "Treat", emoji: "🍦" },
  { id: "fun", label: "Fun", emoji: "🎮" },
  { id: "food", label: "Food", emoji: "🥪" },
  { id: "travel", label: "Travel", emoji: "🚌" },
];

const money = (value) => `$${Number(value || 0).toFixed(2)}`;
const today = () => new Date().toISOString().slice(0, 10);

function loadData() {
  const blank = { balance: 0, goals: [], transactions: [], selectedCategory: "treat", streak: { count: 1, lastActive: today() } };
  try {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const legacyGoals = JSON.parse(localStorage.getItem("goals") || "[]");
    const source = existing || { ...blank, balance: Number(localStorage.getItem("money") || 0), goals: legacyGoals };
    const streak = { ...blank.streak, ...(source.streak || {}) };
    if (streak.lastActive !== today()) {
      const previous = new Date(`${streak.lastActive}T00:00:00`);
      const current = new Date(`${today()}T00:00:00`);
      streak.count = Math.round((current - previous) / 86400000) === 1 ? Number(streak.count || 0) + 1 : 1;
      streak.lastActive = today();
    }
    return { ...blank, ...source, balance: Number(source.balance) || 0, goals: Array.isArray(source.goals) ? source.goals : [], transactions: Array.isArray(source.transactions) ? source.transactions : [], streak };
  } catch {
    return blank;
  }
}

function App() {
  const [data, setData] = useState(loadData);
  const [addAmount, setAddAmount] = useState("");
  const [takeAmount, setTakeAmount] = useState("");
  const [goalName, setGoalName] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [goalAmounts, setGoalAmounts] = useState({});
  const [spendName, setSpendName] = useState("");
  const [spendAmount, setSpendAmount] = useState("");
  const [notice, setNotice] = useState("Ready when you are!");

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }, [data]);

  const selected = categories.find((category) => category.id === data.selectedCategory) || categories[0];
  const recentTransactions = useMemo(() => data.transactions.slice(0, 10), [data.transactions]);

  function updateData(change) { setData((current) => typeof change === "function" ? change(current) : { ...current, ...change }); }
  function addTransaction(current, transaction) {
    return [{ id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...transaction }, ...current.transactions].slice(0, 100);
  }

  function moveMoney(direction) {
    const amount = Number(direction > 0 ? addAmount : takeAmount);
    if (!amount || amount <= 0) return setNotice("Enter an amount bigger than $0.");
    if (direction < 0 && amount > data.balance) return setNotice("You cannot take more than your balance.");
    updateData((current) => ({
      ...current,
      balance: current.balance + amount * direction,
      transactions: addTransaction(current, { label: direction > 0 ? "Money added" : "Money taken", amount, direction, emoji: direction > 0 ? "💵" : "🧾", category: "money" }),
    }));
    direction > 0 ? setAddAmount("") : setTakeAmount("");
    setNotice(direction > 0 ? `${money(amount)} added — nice!` : `${money(amount)} taken from your balance.`);
  }

  function createGoal() {
    const target = Number(goalTarget);
    if (!goalName.trim() || !target || target <= 0) return setNotice("Give your goal a name and target amount.");
    updateData((current) => ({ ...current, goals: [...current.goals, { id: crypto.randomUUID(), name: goalName.trim(), target, saved: 0 }] }));
    setGoalName(""); setGoalTarget(""); setNotice("New goal created. Go get it!");
  }

  function addToGoal(goal) {
    const amount = Number(goalAmounts[goal.id]);
    if (!amount || amount <= 0) return setNotice("Enter an amount to put toward that goal.");
    if (amount > data.balance) return setNotice("Add that money to your balance first.");
    updateData((current) => ({
      ...current,
      balance: current.balance - amount,
      goals: current.goals.map((item) => item.id === goal.id ? { ...item, saved: item.saved + amount } : item),
      transactions: addTransaction(current, { label: `Added to ${goal.name}`, amount, direction: -1, emoji: "🏆", category: "goal" }),
    }));
    setGoalAmounts((current) => ({ ...current, [goal.id]: "" }));
    setNotice(`${money(amount)} moved to ${goal.name}.`);
  }

  function logSpend() {
    const amount = Number(spendAmount);
    if (!spendName.trim() || !amount || amount <= 0) return setNotice("Add what you bought and how much it cost.");
    if (amount > data.balance) return setNotice("That costs more than your available balance.");
    updateData((current) => ({
      ...current,
      balance: current.balance - amount,
      transactions: addTransaction(current, { label: spendName.trim(), amount, direction: -1, emoji: selected.emoji, category: selected.id }),
    }));
    setSpendName(""); setSpendAmount(""); setNotice("Spent logged — nice job keeping track!");
  }

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-icon">💸</span><span>Money HQ</span></div>
      <div className="streak">⚡ {data.streak.count} day money streak!</div>
    </header>

    <div className="dashboard">
      <aside className="card money-tools">
        <p className="eyebrow">Control room</p>
        <h2>Money moves</h2>
        <p className="helper">Add money when it comes in, or take money when it goes out.</p>
        <label>Add Money:</label>
        <input value={addAmount} onChange={(event) => setAddAmount(event.target.value)} type="number" min="0" step="0.01" placeholder="$0.00" />
        <button className="button green" onClick={() => moveMoney(1)}>Add money</button>
        <label className="take-label">Take Money:</label>
        <input value={takeAmount} onChange={(event) => setTakeAmount(event.target.value)} type="number" min="0" step="0.01" placeholder="$0.00" />
        <button className="button orange" onClick={() => moveMoney(-1)}>Take money</button>
        <p className="notice">{notice}</p>
      </aside>

      <motion.section className="hero" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <span className="hero-sun">☀️</span>
        <p className="eyebrow">WELCOME BACK, CHAMP</p>
        <h1>Make your money move.</h1>
        <p className="hero-copy">Every smart choice gives future-you more options.</p>
        <div className="balance"><span>Money left to play with</span><strong>{money(data.balance)}</strong></div>
      </motion.section>

      <section className="card categories">
        <p className="eyebrow">Spending setup</p>
        <h2>Pick a category</h2>
        <div className="category-grid">{categories.map((category) => <button key={category.id} className={data.selectedCategory === category.id ? "category active" : "category"} onClick={() => updateData((current) => ({ ...current, selectedCategory: category.id }))}><span>{category.emoji}</span>{category.label}</button>)}</div>
      </section>

      <section className="card goals">
        <div className="section-head"><div><p className="eyebrow">Mission board</p><h2>Your goals</h2></div><span>🏆</span></div>
        {data.goals.length === 0 && <p className="empty-state">No goals yet. Make your first big move below.</p>}
        {data.goals.map((goal) => {
          const percent = Math.min(100, Math.round(goal.saved / goal.target * 100));
          return <div className="goal" key={goal.id}>
            <div className="goal-top"><div><strong>{goal.name}</strong><small>{money(goal.saved)} of {money(goal.target)}</small></div><b>{percent}%</b></div>
            <div className="progress"><i style={{ width: `${percent}%` }} /></div>
            <div className="goal-action"><input value={goalAmounts[goal.id] || ""} onChange={(event) => setGoalAmounts((current) => ({ ...current, [goal.id]: event.target.value }))} type="number" min="0" step="0.01" placeholder="Amount" /><button className="button blue" onClick={() => addToGoal(goal)}>Add to goal</button></div>
          </div>;
        })}
        <div className="new-goal"><input value={goalName} onChange={(event) => setGoalName(event.target.value)} placeholder="New goal name" /><input value={goalTarget} onChange={(event) => setGoalTarget(event.target.value)} type="number" min="1" step="1" placeholder="Target" /><button className="button blue" onClick={createGoal}>New goal</button></div>
      </section>

      <section className="card spend">
        <p className="eyebrow">{selected.emoji} {selected.label} spending</p>
        <h2>Log a spend</h2>
        <div className="spend-form"><input value={spendName} onChange={(event) => setSpendName(event.target.value)} placeholder="What did you buy?" /><input value={spendAmount} onChange={(event) => setSpendAmount(event.target.value)} type="number" min="0" step="0.01" placeholder="$0.00" /><button className="button orange" onClick={logSpend}>Log it</button></div>
      </section>

      <section className="card activity">
        <div className="section-head"><div><p className="eyebrow">Game tape</p><h2>Recent activity</h2></div><span>📋</span></div>
        {recentTransactions.length === 0 ? <p className="empty-state">Your moves will show up here.</p> : <div className="transaction-list">{recentTransactions.map((transaction) => <div className="transaction" key={transaction.id}><span>{transaction.emoji} {transaction.label}</span><strong className={transaction.direction > 0 ? "plus" : "minus"}>{transaction.direction > 0 ? "+" : "-"}{money(transaction.amount)}</strong></div>)}</div>}
      </section>
    </div>
  </main>;
}

createRoot(document.getElementById("root")).render(<App />);
