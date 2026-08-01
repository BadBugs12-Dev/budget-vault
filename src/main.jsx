import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createRoot } from "react-dom/client";
import "./style.css";

const STORAGE_KEY = "money-hq-premium-v2";
const LEGACY_KEY = "money-hq-data-v1";

const CATEGORIES = [
  { id: "food", label: "Food & drink", icon: "☕", color: "#8b5cf6" },
  { id: "fun", label: "Fun", icon: "🎮", color: "#ec4899" },
  { id: "travel", label: "Travel", icon: "✈", color: "#06b6d4" },
  { id: "shopping", label: "Shopping", icon: "🛍", color: "#f59e0b" },
  { id: "bills", label: "Bills", icon: "⌁", color: "#64748b" },
  { id: "other", label: "Other", icon: "⋯", color: "#10b981" },
];

const NAV_ITEMS = [
  ["dashboard", "⌂", "Overview"],
  ["analytics", "◔", "Analytics"],
  ["goals", "◎", "Goals"],
  ["activity", "≡", "Activity"],
];

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const shortCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const formatMoney = (value) => currency.format(Number(value || 0));
const formatShortMoney = (value) => shortCurrency.format(Number(value || 0));
const safeNumber = (value) => Math.max(0, Number(value) || 0);

const makeId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function dateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function readStorage(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeGoal(goal, index) {
  return {
    id: goal?.id || `goal-${index}-${makeId()}`,
    name: String(goal?.name || goal?.title || "Untitled goal").slice(0, 60),
    target: Math.max(1, safeNumber(goal?.target || 1)),
    saved: safeNumber(goal?.saved),
    icon: goal?.icon || "✦",
    createdAt: goal?.createdAt || new Date().toISOString(),
  };
}

function normalizeTransaction(transaction, index) {
  const direction = Number(transaction?.direction) >= 0 ? 1 : -1;
  const type =
    transaction?.type ||
    (direction > 0
      ? "income"
      : transaction?.category === "goal"
        ? "saving"
        : "expense");

  return {
    id: transaction?.id || `tx-${index}-${makeId()}`,
    label: String(transaction?.label || "Money movement").slice(0, 90),
    amount: safeNumber(transaction?.amount),
    direction,
    type,
    category:
      transaction?.category || (type === "income" ? "income" : "other"),
    icon:
      transaction?.icon ||
      transaction?.emoji ||
      (direction > 0 ? "↗" : "↘"),
    createdAt: transaction?.createdAt || new Date().toISOString(),
  };
}

function loadVault() {
  const fallback = {
    balance: 0,
    goals: [],
    transactions: [],
    selectedCategory: "food",
    streak: {
      count: 1,
      lastActiveDate: dateKey(),
    },
  };

  const current = readStorage(STORAGE_KEY);
  const legacy = readStorage(LEGACY_KEY);
  const oldGoals = readStorage("goals", []);

  const source =
    current ||
    legacy || {
      ...fallback,
      balance: safeNumber(localStorage.getItem("money")),
      goals: oldGoals,
    };

  const legacyGoals = Array.isArray(source.goals)
    ? source.goals
    : source.goal
      ? [source.goal]
      : [];

  const oldStreak = source.streak || {};
  const previousDate =
    oldStreak.lastActiveDate || oldStreak.lastActive || dateKey();
  const currentDate = dateKey();

  const daysSinceActivity = Math.round(
    (new Date(`${currentDate}T00:00:00`) -
      new Date(`${previousDate}T00:00:00`)) /
      86400000,
  );

  const streak = {
    count:
      daysSinceActivity === 1
        ? safeNumber(oldStreak.count || 1) + 1
        : daysSinceActivity > 1
          ? 1
          : Math.max(1, safeNumber(oldStreak.count || 1)),
    lastActiveDate: currentDate,
  };

  return {
    balance: safeNumber(source.balance),
    goals: legacyGoals.map(normalizeGoal),
    transactions: Array.isArray(source.transactions)
      ? source.transactions.map(normalizeTransaction)
      : [],
    selectedCategory: CATEGORIES.some(
      (category) => category.id === source.selectedCategory,
    )
      ? source.selectedCategory
      : "food",
    streak,
  };
}

function categoryFor(id) {
  return (
    CATEGORIES.find((category) => category.id === id) ||
    CATEGORIES[CATEGORIES.length - 1]
  );
}

function transactionDate(value) {
  const date = new Date(value);
  const today = dateKey();
  const yesterday = dateKey(new Date(Date.now() - 86400000));

  if (dateKey(date) === today) return "Today";
  if (dateKey(date) === yesterday) return "Yesterday";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function createTransaction({
  label,
  amount,
  direction,
  type,
  category,
  icon,
}) {
  return {
    id: makeId(),
    label,
    amount: safeNumber(amount),
    direction,
    type,
    category,
    icon,
    createdAt: new Date().toISOString(),
  };
}

function Modal({ title, subtitle, children, onClose }) {
  useEffect(() => {
    const closeOnEscape = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", closeOnEscape);

    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={onClose}
    >
      <motion.section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 14, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 360, damping: 29 }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">Money HQ</p>
            <h2 id="modal-title">{title}</h2>
            <p>{subtitle}</p>
          </div>

          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>

        {children}
      </motion.section>
    </motion.div>
  );
}

function AmountInput({ id, label, value, onChange, placeholder = "$0.00" }) {
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>

      <div className="money-input">
        <span>$</span>
        <input
          id={id}
          inputMode="decimal"
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder.replace("$", "")}
        />
      </div>
    </label>
  );
}

function App() {
  const [vault, setVault] = useState(loadVault);
  const [activeNav, setActiveNav] = useState("dashboard");
  const [modal, setModal] = useState(null);
  const [filter, setFilter] = useState("all");
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(vault));
  }, [vault]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const selectedCategory = categoryFor(vault.selectedCategory);

  const income = useMemo(
    () =>
      vault.transactions
        .filter((item) => item.type === "income")
        .reduce((sum, item) => sum + item.amount, 0),
    [vault.transactions],
  );

  const expenses = useMemo(
    () =>
      vault.transactions
        .filter((item) => item.type === "expense")
        .reduce((sum, item) => sum + item.amount, 0),
    [vault.transactions],
  );

  const savings = useMemo(
    () => vault.goals.reduce((sum, goal) => sum + goal.saved, 0),
    [vault.goals],
  );

  const totalGoalTarget = useMemo(
    () => vault.goals.reduce((sum, goal) => sum + goal.target, 0),
    [vault.goals],
  );

  const savingsRate =
    income > 0
      ? Math.min(100, Math.round((savings / income) * 100))
      : savings > 0
        ? 100
        : 0;

  const healthScore = Math.max(
    22,
    Math.min(
      99,
      Math.round(
        42 +
          Math.min(26, vault.balance / 15) +
          Math.min(18, savingsRate * 0.28) +
          Math.min(14, vault.streak.count * 1.3),
      ),
    ),
  );

  const healthLabel =
    healthScore >= 82
      ? "Excellent"
      : healthScore >= 65
        ? "Strong"
        : healthScore >= 45
          ? "Building"
          : "Starting";

  const recentTransactions = useMemo(
    () =>
      vault.transactions
        .filter(
          (transaction) => filter === "all" || transaction.type === filter,
        )
        .slice(0, 8),
    [vault.transactions, filter],
  );

  const completedGoals = vault.goals.filter(
    (goal) => goal.saved >= goal.target,
  ).length;

  const categoryTotals = useMemo(() => {
    const sums = Object.fromEntries(
      CATEGORIES.map((category) => [category.id, 0]),
    );

    vault.transactions
      .filter((item) => item.type === "expense")
      .forEach((item) => {
        sums[item.category] = (sums[item.category] || 0) + item.amount;
      });

    return CATEGORIES.map((category) => ({
      ...category,
      amount: sums[category.id] || 0,
    })).sort((a, b) => b.amount - a.amount);
  }, [vault.transactions]);

  const dailySpending = useMemo(() => {
    const dates = Array.from(
      { length: 7 },
      (_, index) => new Date(Date.now() - (6 - index) * 86400000),
    );

    return dates.map((date) => {
      const key = dateKey(date);

      const amount = vault.transactions
        .filter(
          (item) => item.type === "expense" && dateKey(item.createdAt) === key,
        )
        .reduce((sum, item) => sum + item.amount, 0);

      return {
        label: new Intl.DateTimeFormat("en-US", {
          weekday: "short",
        })
          .format(date)
          .slice(0, 1),
        amount,
        isToday: key === dateKey(),
      };
    });
  }, [vault.transactions]);

  const highestDailySpend = Math.max(
    1,
    ...dailySpending.map((day) => day.amount),
  );

  const donutStops = useMemo(() => {
    const total = categoryTotals.reduce((sum, item) => sum + item.amount, 0);

    if (!total) return "#1d2940 0deg 360deg";

    let cursor = 0;

    return categoryTotals
      .filter((item) => item.amount > 0)
      .map((item) => {
        const start = cursor;
        cursor += (item.amount / total) * 360;
        return `${item.color} ${start}deg ${cursor}deg`;
      })
      .join(", ");
  }, [categoryTotals]);

  const achievements = [
    {
      icon: "⚡",
      title: "On a roll",
      text: `${vault.streak.count} day streak`,
      unlocked: vault.streak.count >= 3,
    },
    {
      icon: "✦",
      title: "Goal getter",
      text: `${completedGoals} goals complete`,
      unlocked: completedGoals > 0,
    },
    {
      icon: "◈",
      title: "Cash captain",
      text: `${formatMoney(vault.balance)} available`,
      unlocked: vault.balance >= 100,
    },
    {
      icon: "◎",
      title: "Tracker",
      text: `${vault.transactions.length} money moves`,
      unlocked: vault.transactions.length >= 5,
    },
  ];

  function commit(updater) {
    setVault((current) => updater(current));
  }

  function showToast(title, detail, tone = "success") {
    clearTimeout(toastTimer.current);

    setToast({
      title,
      detail,
      tone,
    });

    toastTimer.current = setTimeout(() => setToast(null), 4300);
  }

  function addMoney(amount, note) {
    const value = safeNumber(amount);

    if (!value) {
      return showToast(
        "Enter an amount",
        "Add a number bigger than zero to continue.",
        "error",
      );
    }

    commit((current) => ({
      ...current,
      balance: current.balance + value,
      transactions: [
        createTransaction({
          label: note.trim() || "Money added",
          amount: value,
          direction: 1,
          type: "income",
          category: "income",
          icon: "↗",
        }),
        ...current.transactions,
      ].slice(0, 150),
    }));

    setModal(null);
    showToast("Money added", `${formatMoney(value)} is now ready to use.`);
  }

  function removeMoney(
    amount,
    note,
    categoryId = vault.selectedCategory,
  ) {
    const value = safeNumber(amount);

    if (!value) {
      return showToast(
        "Enter an amount",
        "Add a number bigger than zero to continue.",
        "error",
      );
    }

    if (value > vault.balance) {
      return showToast(
        "Not enough available",
        "Add money first or use a smaller amount.",
        "error",
      );
    }

    const category = categoryFor(categoryId);

    commit((current) => ({
      ...current,
      balance: current.balance - value,
      transactions: [
        createTransaction({
          label: note.trim() || category.label,
          amount: value,
          direction: -1,
          type: "expense",
          category: category.id,
          icon: category.icon,
        }),
        ...current.transactions,
      ].slice(0, 150),
    }));

    setModal(null);

    showToast(
      "Expense recorded",
      `${formatMoney(value)} was added to ${category.label.toLowerCase()}.`,
    );
  }

  function createGoal(name, target, icon) {
    const value = safeNumber(target);

    if (!name.trim() || !value) {
      return showToast(
        "Complete your goal",
        "Give it a name and target amount.",
        "error",
      );
    }

    commit((current) => ({
      ...current,
      goals: [
        ...current.goals,
        {
          id: makeId(),
          name: name.trim().slice(0, 60),
          target: value,
          saved: 0,
          icon,
          createdAt: new Date().toISOString(),
        },
      ],
    }));

    setModal(null);

    showToast(
      "Goal created",
      `${name.trim()} is officially on your mission board.`,
    );
  }

  function contributeToGoal(goalId, amount) {
    const value = safeNumber(amount);
    const goal = vault.goals.find((item) => item.id === goalId);

    if (!value || !goal) {
      return showToast(
        "Enter an amount",
        "Choose how much you want to save.",
        "error",
      );
    }

    if (value > vault.balance) {
      return showToast(
        "Not enough available",
        "Add money before sending it to your goal.",
        "error",
      );
    }

    const willComplete = goal.saved + value >= goal.target;

    commit((current) => ({
      ...current,
      balance: current.balance - value,
      goals: current.goals.map((item) =>
        item.id === goalId
          ? {
              ...item,
              saved: item.saved + value,
            }
          : item,
      ),
      transactions: [
        createTransaction({
          label: `Saved for ${goal.name}`,
          amount: value,
          direction: -1,
          type: "saving",
          category: "goal",
          icon: goal.icon,
        }),
        ...current.transactions,
      ].slice(0, 150),
    }));

    showToast(
      willComplete ? "Goal complete!" : "Savings moved",
      willComplete
        ? `${goal.name} is fully funded. Huge win.`
        : `${formatMoney(value)} is working toward ${goal.name}.`,
    );
  }

  function setCategory(categoryId) {
    commit((current) => ({
      ...current,
      selectedCategory: categoryId,
    }));
  }

  function navigate(section) {
    setActiveNav(section);

    document
      .getElementById(`${section}-section`)
      ?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
  }

  return (
    <div className="vault-app">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand">
          <div className="brand-mark">V</div>

          <div>
            <strong>Vault</strong>
            <span>Money HQ</span>
          </div>
        </div>

        <nav>
          {NAV_ITEMS.map(([id, icon, label]) => (
            <button
              key={id}
              className={activeNav === id ? "nav-item active" : "nav-item"}
              onClick={() => navigate(id)}
            >
              <span>{icon}</span>
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="streak-card">
            <span>⚡</span>

            <div>
              <small>Daily streak</small>
              <strong>{vault.streak.count} days</strong>
            </div>
          </div>

          <div className="account">
            <div className="avatar">BB</div>

            <div>
              <strong>BadBugs12-Dev</strong>
              <span>Personal vault</span>
            </div>

            <button aria-label="Account settings">⋮</button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">PERSONAL FINANCE, REIMAGINED</p>
            <h1>Good afternoon, Builder.</h1>
            <p className="topbar-copy">
              Your money is organized. Your next move is yours.
            </p>
          </div>

          <div className="top-actions">
            <button
              className="icon-button notification"
              aria-label="Notifications"
            >
              ♢
              <i />
            </button>

            <button className="profile-button" aria-label="Open profile">
              <span className="avatar">BB</span>
              <span>⌄</span>
            </button>
          </div>
        </header>

        <section id="dashboard-section" className="hero-grid section-anchor">
          <motion.article
            className="balance-hero"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
          >
            <div className="hero-glow one" />
            <div className="hero-glow two" />

            <div className="hero-header">
              <div>
                <p>Available balance</p>
                <h2>{formatMoney(vault.balance)}</h2>
              </div>

              <button className="hero-menu" aria-label="Balance options">
                •••
              </button>
            </div>

            <div className="hero-stat-row">
              <span>
                <b>↗</b>
                Income <strong>{formatMoney(income)}</strong>
              </span>

              <span>
                <b>↘</b>
                Outgoing <strong>{formatMoney(expenses + savings)}</strong>
              </span>
            </div>

            <div className="hero-actions">
              <button
                className="primary-action"
                onClick={() => setModal("add")}
              >
                ↗ Add money
              </button>

              <button
                className="secondary-action"
                onClick={() => setModal("expense")}
              >
                ↘ Record expense
              </button>

              <button
                className="ghost-action"
                onClick={() => setModal("goal")}
              >
                + New goal
              </button>
            </div>
          </motion.article>

          <article className="health-card">
            <div className="health-copy">
              <p className="eyebrow">FINANCIAL HEALTH</p>
              <h2>{healthLabel}</h2>
              <p>Healthy habits are compounding.</p>
              <span>
                +{Math.min(12, Math.max(1, vault.streak.count))} this week
              </span>
            </div>

            <div
              className="health-ring"
              style={{ "--score": `${healthScore * 3.6}deg` }}
            >
              <div>
                <strong>{healthScore}</strong>
                <small>/ 100</small>
              </div>
            </div>
          </article>
        </section>

        <section className="metric-grid" aria-label="Financial overview">
          <article className="metric-card">
            <div className="metric-icon income">↗</div>

            <div>
              <span>Income tracked</span>
              <strong>{formatMoney(income)}</strong>
              <small>
                {income ? "All incoming money" : "Add money to begin"}
              </small>
            </div>
          </article>

          <article className="metric-card">
            <div className="metric-icon savings">✦</div>

            <div>
              <span>In your goals</span>
              <strong>{formatMoney(savings)}</strong>
              <small>
                {totalGoalTarget
                  ? `${Math.round((savings / totalGoalTarget) * 100)}% of all targets`
                  : "Create a savings goal"}
              </small>
            </div>
          </article>

          <article className="metric-card">
            <div className="metric-icon streak">⚡</div>

            <div>
              <span>Current streak</span>
              <strong>{vault.streak.count} days</strong>
              <small>Keep the momentum going</small>
            </div>
          </article>
        </section>

        <section id="analytics-section" className="content-grid section-anchor">
          <article className="panel spending-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">EXPENSE ANALYTICS</p>
                <h2>Spending this week</h2>
              </div>

              <span className="period-pill">Last 7 days</span>
            </div>

            <div className="bar-chart" aria-label="Daily spending chart">
              {dailySpending.map((day, index) => (
                <div className="bar-day" key={`${day.label}-${index}`}>
                  <span className="bar-tooltip">
                    {formatMoney(day.amount)}
                  </span>

                  <div
                    className={day.isToday ? "bar active" : "bar"}
                    style={{
                      height: `${Math.max(
                        day.amount ? 12 : 4,
                        (day.amount / highestDailySpend) * 100,
                      )}%`,
                    }}
                  />

                  <small>{day.label}</small>
                </div>
              ))}
            </div>

            <div className="chart-footer">
              <span>
                <i className="chart-dot" />
                Spending
              </span>

              <strong>{formatMoney(expenses)} total tracked</strong>
            </div>
          </article>

          <article className="panel category-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">SPENDING BREAKDOWN</p>
                <h2>Where it went</h2>
              </div>

              <button
                className="text-button"
                onClick={() => navigate("activity")}
              >
                View activity
              </button>
            </div>

            <div className="donut-layout">
              <div
                className="donut"
                style={{
                  background: `conic-gradient(${donutStops})`,
                }}
              >
                <div>
                  <strong>{formatShortMoney(expenses)}</strong>
                  <small>spent</small>
                </div>
              </div>

              <div className="category-legend">
                {categoryTotals.slice(0, 4).map((category) => (
                  <div key={category.id}>
                    <span>
                      <i style={{ background: category.color }} />
                      {category.label}
                    </span>

                    <strong>{formatMoney(category.amount)}</strong>
                  </div>
                ))}
              </div>
            </div>
          </article>
        </section>

        <section id="goals-section" className="section-anchor panel goals-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">YOUR MISSION BOARD</p>
              <h2>Goals in progress</h2>
            </div>

            <button className="text-button" onClick={() => setModal("goal")}>
              + Create goal
            </button>
          </div>

          {vault.goals.length === 0 ? (
            <div className="empty-goals">
              <div>✦</div>
              <h3>Give your money a mission.</h3>
              <p>
                Create a goal for something worth working toward, then move
                money into it whenever you can.
              </p>

              <button
                className="primary-action"
                onClick={() => setModal("goal")}
              >
                Create your first goal
              </button>
            </div>
          ) : (
            <div className="goal-grid">
              {vault.goals.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  balance={vault.balance}
                  onContribute={contributeToGoal}
                />
              ))}
            </div>
          )}
        </section>

        <section id="activity-section" className="lower-grid section-anchor">
          <article className="panel activity-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">LIVE LEDGER</p>
                <h2>Recent activity</h2>
              </div>

              <div className="filters" aria-label="Transaction filters">
                {[
                  ["all", "All"],
                  ["income", "Income"],
                  ["expense", "Spending"],
                  ["saving", "Goals"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    className={filter === id ? "filter active" : "filter"}
                    onClick={() => setFilter(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {recentTransactions.length === 0 ? (
              <div className="empty-activity">
                <span>⌁</span>
                <h3>Your story starts here.</h3>
                <p>
                  Every add, expense, and goal move will appear in your private
                  ledger.
                </p>

                <button
                  className="text-button"
                  onClick={() => setModal("add")}
                >
                  Add your first money move
                </button>
              </div>
            ) : (
              <div className="transaction-list">
                {recentTransactions.map((transaction) => (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                  />
                ))}
              </div>
            )}
          </article>

          <article className="panel achievements-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">MILESTONES</p>
                <h2>Achievements</h2>
              </div>

              <span className="achievement-count">
                {achievements.filter((item) => item.unlocked).length}/
                {achievements.length}
              </span>
            </div>

            <div className="achievement-list">
              {achievements.map((achievement) => (
                <div
                  className={
                    achievement.unlocked
                      ? "achievement unlocked"
                      : "achievement"
                  }
                  key={achievement.title}
                >
                  <span>{achievement.icon}</span>

                  <div>
                    <strong>{achievement.title}</strong>
                    <small>{achievement.text}</small>
                  </div>

                  <b>{achievement.unlocked ? "✓" : "·"}</b>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="category-selector panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">QUICK EXPENSE SETUP</p>
              <h2>Choose a spending category</h2>
            </div>

            <span className="selection-label">
              Selected: {selectedCategory.label}
            </span>
          </div>

          <div className="category-pills">
            {CATEGORIES.map((category) => (
              <button
                key={category.id}
                className={
                  vault.selectedCategory === category.id
                    ? "category-pill active"
                    : "category-pill"
                }
                style={{ "--category": category.color }}
                onClick={() => setCategory(category.id)}
              >
                <span>{category.icon}</span>
                {category.label}
              </button>
            ))}
          </div>
        </section>
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {NAV_ITEMS.map(([id, icon, label]) => (
          <button
            key={id}
            className={activeNav === id ? "active" : ""}
            onClick={() => navigate(id)}
          >
            <span>{icon}</span>
            <small>{label}</small>
          </button>
        ))}
      </nav>

      <AnimatePresence>
        {modal === "add" && (
          <AddMoneyModal
            onClose={() => setModal(null)}
            onSubmit={addMoney}
          />
        )}

        {modal === "expense" && (
          <ExpenseModal
            category={selectedCategory}
            onClose={() => setModal(null)}
            onSubmit={removeMoney}
          />
        )}

        {modal === "goal" && (
          <GoalModal
            onClose={() => setModal(null)}
            onSubmit={createGoal}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            className={`toast ${toast.tone}`}
            role="status"
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.96 }}
          >
            <span>{toast.tone === "error" ? "!" : "✓"}</span>

            <div>
              <strong>{toast.title}</strong>
              <p>{toast.detail}</p>
            </div>

            <button onClick={() => setToast(null)} aria-label="Dismiss message">
              ×
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function GoalCard({ goal, balance, onContribute }) {
  const [amount, setAmount] = useState("");
  const progress = Math.min(100, Math.round((goal.saved / goal.target) * 100));
  const complete = progress >= 100;

  function submit(event) {
    event.preventDefault();
    onContribute(goal.id, amount);
    setAmount("");
  }

  return (
    <article className={complete ? "goal-card complete" : "goal-card"}>
      <div className="goal-card-top">
        <span className="goal-icon">{goal.icon}</span>

        <span className={complete ? "goal-status complete" : "goal-status"}>
          {complete ? "Complete" : `${progress}% funded`}
        </span>
      </div>

      <h3>{goal.name}</h3>

      <p>
        <strong>{formatMoney(goal.saved)}</strong> of {formatMoney(goal.target)}
      </p>

      <div
        className="progress-track"
        aria-label={`${goal.name} is ${progress}% funded`}
      >
        <i style={{ width: `${progress}%` }} />
      </div>

      <form className="goal-contribute" onSubmit={submit}>
        <div>
          <span>$</span>

          <input
            aria-label={`Amount to add to ${goal.name}`}
            inputMode="decimal"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
          />
        </div>

        <button type="submit" disabled={complete || balance <= 0}>
          {complete ? "Funded" : "Save"}
        </button>
      </form>
    </article>
  );
}

function TransactionRow({ transaction }) {
  const isPositive = transaction.direction > 0;
  const category =
    transaction.type === "expense"
      ? categoryFor(transaction.category)
      : null;

  return (
    <div className="transaction-row">
      <div
        className={
          isPositive
            ? "transaction-icon positive"
            : transaction.type === "saving"
              ? "transaction-icon saving"
              : "transaction-icon"
        }
      >
        {transaction.icon}
      </div>

      <div className="transaction-info">
        <strong>{transaction.label}</strong>

        <span>
          {category
            ? category.label
            : transaction.type === "saving"
              ? "Goal contribution"
              : "Income"}{" "}
          · {transactionDate(transaction.createdAt)}
        </span>
      </div>

      <div
        className={
          isPositive ? "transaction-amount positive" : "transaction-amount"
        }
      >
        <strong>
          {isPositive ? "+" : "−"}
          {formatMoney(transaction.amount)}
        </strong>

        <span>
          {isPositive ? "Added" : transaction.type === "saving" ? "Saved" : "Spent"}
        </span>
      </div>
    </div>
  );
}

function AddMoneyModal({ onClose, onSubmit }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  return (
    <Modal
      title="Add money"
      subtitle="Record income, a deposit, or cash you received."
      onClose={onClose}
    >
      <form
        className="modal-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(amount, note);
        }}
      >
        <AmountInput
          id="add-money-amount"
          label="Amount"
          value={amount}
          onChange={setAmount}
        />

        <label className="field" htmlFor="add-money-note">
          <span>
            Note <em>Optional</em>
          </span>

          <input
            id="add-money-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Paycheck, allowance, sold something..."
            maxLength="90"
          />
        </label>

        <button className="primary-action full" type="submit">
          Add to available balance <span>↗</span>
        </button>
      </form>
    </Modal>
  );
}

function ExpenseModal({ category, onClose, onSubmit }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  return (
    <Modal
      title="Record an expense"
      subtitle={`This will be saved under ${category.label}.`}
      onClose={onClose}
    >
      <form
        className="modal-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(amount, note, category.id);
        }}
      >
        <div className="selected-category">
          <span>{category.icon}</span>

          <div>
            <small>Spending category</small>
            <strong>{category.label}</strong>
          </div>
        </div>

        <AmountInput
          id="expense-amount"
          label="How much did it cost?"
          value={amount}
          onChange={setAmount}
        />

        <label className="field" htmlFor="expense-note">
          <span>What was it?</span>

          <input
            id="expense-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Coffee, game, bus pass..."
            maxLength="90"
          />
        </label>

        <button className="secondary-action full" type="submit">
          Record expense <span>↘</span>
        </button>
      </form>
    </Modal>
  );
}

function GoalModal({ onClose, onSubmit }) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [icon, setIcon] = useState("✦");

  const icons = ["✦", "⌁", "◈", "✈", "🎮", "🏆"];

  return (
    <Modal
      title="Create a goal"
      subtitle="Turn a future purchase into a clear plan."
      onClose={onClose}
    >
      <form
        className="modal-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(name, target, icon);
        }}
      >
        <label className="field" htmlFor="goal-name">
          <span>What are you saving for?</span>

          <input
            id="goal-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New bike, trip, laptop..."
            maxLength="60"
            autoFocus
          />
        </label>

        <AmountInput
          id="goal-target"
          label="Target amount"
          value={target}
          onChange={setTarget}
        />

        <fieldset className="icon-chooser">
          <legend>Choose an icon</legend>

          <div>
            {icons.map((item) => (
              <button
                className={icon === item ? "active" : ""}
                type="button"
                key={item}
                onClick={() => setIcon(item)}
                aria-label={`Use ${item} as the goal icon`}
              >
                {item}
              </button>
            ))}
          </div>
        </fieldset>

        <button className="primary-action full" type="submit">
          Create goal <span>✦</span>
        </button>
      </form>
    </Modal>
  );
}

createRoot(document.getElementById("root")).render(<App />);
