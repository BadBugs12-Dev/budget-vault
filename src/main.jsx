import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createRoot } from "react-dom/client";
import "./style.css";

const STORAGE_KEY = "money-hq-premium-v4";
const PREVIOUS_STORAGE_KEY = "money-hq-premium-v3";
const OLDER_STORAGE_KEY = "money-hq-premium-v2";
const LEGACY_KEY = "money-hq-data-v1";

// Categories remain only for historical analytics. New purchases never ask the user to pick one.
const CATEGORIES = [
  { id: "purchases", label: "Purchases", icon: "🛍", color: "#5eead4" },
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
  ["vaults", "💰", "Vault"],
];

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const shortCurrency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
const formatMoney = (value) => currency.format(Number(value || 0));
const formatShortMoney = (value) => shortCurrency.format(Number(value || 0));
const safeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100) / 100) : 0;
};
const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

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

function looksLikeAppState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  return Object.prototype.hasOwnProperty.call(value, "balance")
    || Array.isArray(value.goals)
    || Array.isArray(value.vaults)
    || Array.isArray(value.transactions)
    || Boolean(value.goal)
    || Boolean(value.streak)
    || Boolean(value.savingStreak);
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

function normalizeVault(vault, index) {
  return {
    id: vault?.id || `vault-${index}-${makeId()}`,
    name: String(vault?.name || "Untitled Vault").slice(0, 60),
    target: Math.max(1, safeNumber(vault?.target || 1)),
    saved: safeNumber(vault?.saved),
    icon: vault?.icon || "🔒",
    createdAt: vault?.createdAt || new Date().toISOString(),
    completedAt: vault?.completedAt || null,
  };
}

function normalizeTransaction(transaction, index) {
  const direction = Number(transaction?.direction) >= 0 ? 1 : -1;
  const rawType = transaction?.type || (direction > 0 ? "income" : transaction?.category === "goal" ? "saving" : "expense");
  const type = rawType === "vault" ? (direction > 0 ? "vault_withdrawal" : "vault_deposit") : rawType;

  return {
    id: transaction?.id || `tx-${index}-${makeId()}`,
    label: String(transaction?.label || "Money movement").slice(0, 90),
    amount: safeNumber(transaction?.amount),
    direction,
    type,
    category: transaction?.category || (type === "income" ? "income" : "purchases"),
    vaultId: transaction?.vaultId || null,
    icon: transaction?.icon || transaction?.emoji || (direction > 0 ? "↗" : "↘"),
    createdAt: transaction?.createdAt || new Date().toISOString(),
  };
}

function loadVault() {
  const fallback = {
    balance: 0,
    goals: [],
    vaults: [],
    transactions: [],
    selectedCategory: "purchases",
    streak: { count: 1, lastActiveDate: dateKey() },
    savingStreak: { count: 0, lastSavedDate: null },
    achievementUnlocks: {},
    vaultStats: { totalEverLocked: 0 },
  };

  const current = readStorage(STORAGE_KEY);
  const previous = readStorage(PREVIOUS_STORAGE_KEY);
  const older = readStorage(OLDER_STORAGE_KEY);
  const legacy = readStorage(LEGACY_KEY);
  const oldGoals = readStorage("goals", []);

  const source = [current, previous, older, legacy].find(looksLikeAppState) || {
    ...fallback,
    balance: safeNumber(localStorage.getItem("money")),
    goals: oldGoals,
  };

  const legacyGoals = Array.isArray(source.goals) ? source.goals : source.goal ? [source.goal] : [];
  const oldStreak = source.streak || {};
  const previousDate = oldStreak.lastActiveDate || oldStreak.lastActive || dateKey();
  const currentDate = dateKey();
  const daysSinceActivity = Math.round((new Date(`${currentDate}T00:00:00`) - new Date(`${previousDate}T00:00:00`)) / 86400000);

  const streak = {
    count: daysSinceActivity === 1
      ? safeNumber(oldStreak.count || 1) + 1
      : daysSinceActivity > 1
        ? 1
        : Math.max(1, safeNumber(oldStreak.count || 1)),
    lastActiveDate: currentDate,
  };

  const sourceSavingStreak = source.savingStreak || {};

  return {
    balance: safeNumber(source.balance),
    goals: legacyGoals.map(normalizeGoal),
    vaults: Array.isArray(source.vaults) ? source.vaults.map(normalizeVault) : [],
    transactions: Array.isArray(source.transactions) ? source.transactions.map(normalizeTransaction) : [],
    selectedCategory: CATEGORIES.some((category) => category.id === source.selectedCategory) ? source.selectedCategory : "purchases",
    streak,
    savingStreak: {
      count: safeNumber(sourceSavingStreak.count),
      lastSavedDate: typeof sourceSavingStreak.lastSavedDate === "string" ? sourceSavingStreak.lastSavedDate : null,
    },
    achievementUnlocks: source.achievementUnlocks && typeof source.achievementUnlocks === "object" ? source.achievementUnlocks : {},
    vaultStats: { totalEverLocked: safeNumber(source.vaultStats?.totalEverLocked) },
  };
}

function categoryFor(id) {
  return CATEGORIES.find((category) => category.id === id) || CATEGORIES[0];
}

function transactionDate(value) {
  const date = new Date(value);
  const today = dateKey();
  const yesterday = dateKey(new Date(Date.now() - 86400000));

  if (dateKey(date) === today) return "Today";
  if (dateKey(date) === yesterday) return "Yesterday";

  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function createTransaction({ label, amount, direction, type, category, icon, vaultId = null }) {
  return {
    id: makeId(),
    label,
    amount: safeNumber(amount),
    direction,
    type,
    category,
    icon,
    vaultId,
    createdAt: new Date().toISOString(),
  };
}

function advanceSavingStreak(currentStreak) {
  const today = dateKey();
  const previousDate = currentStreak?.lastSavedDate;

  if (previousDate === today) return currentStreak || { count: 1, lastSavedDate: today };
  if (!previousDate) return { count: 1, lastSavedDate: today };

  const daysSinceLastSave = Math.round((new Date(`${today}T00:00:00`) - new Date(`${previousDate}T00:00:00`)) / 86400000);

  return {
    count: daysSinceLastSave === 1 ? safeNumber(currentStreak.count) + 1 : 1,
    lastSavedDate: today,
  };
}

function addAchievement(unlocks, id) {
  return unlocks?.[id] ? unlocks : { ...(unlocks || {}), [id]: new Date().toISOString() };
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
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">×</button>
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
  const vaultRef = useRef(vault);
  const [activeNav, setActiveNav] = useState("dashboard");
  const [pendingNavigation, setPendingNavigation] = useState(null);
  const [modal, setModal] = useState(null);
  const [selectedVaultId, setSelectedVaultId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [toast, setToast] = useState(null);
  const [fundingVaultId, setFundingVaultId] = useState(null);
  const [vaultCelebration, setVaultCelebration] = useState(null);
  const toastTimer = useRef(null);
  const vaultAnimationTimer = useRef(null);

  useEffect(() => {
    vaultRef.current = vault;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(vault));
  }, [vault]);

  useEffect(() => () => {
    clearTimeout(toastTimer.current);
    clearTimeout(vaultAnimationTimer.current);
  }, []);

  useEffect(() => {
    if (!pendingNavigation) return undefined;

    const frame = requestAnimationFrame(() => {
      if (pendingNavigation === "vaults") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        document.getElementById(`${pendingNavigation}-section`)?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }

      setPendingNavigation(null);
    });

    return () => cancelAnimationFrame(frame);
  }, [activeNav, pendingNavigation]);

  const income = useMemo(
    () => vault.transactions.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amount, 0),
    [vault.transactions],
  );

  const expenses = useMemo(
    () => vault.transactions.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0),
    [vault.transactions],
  );

  const savings = useMemo(
    () => vault.goals.reduce((sum, goal) => sum + goal.saved, 0),
    [vault.goals],
  );

  const lockedInVaults = useMemo(
    () => vault.vaults.reduce((sum, item) => sum + item.saved, 0),
    [vault.vaults],
  );

  const totalGoalTarget = useMemo(
    () => vault.goals.reduce((sum, goal) => sum + goal.target, 0),
    [vault.goals],
  );

  const totalVaultTarget = useMemo(
    () => vault.vaults.reduce((sum, item) => sum + item.target, 0),
    [vault.vaults],
  );

  const savingsRate = income > 0 ? Math.min(100, Math.round((savings / income) * 100)) : savings > 0 ? 100 : 0;

  const healthScore = Math.max(
    22,
    Math.min(
      99,
      Math.round(
        42
        + Math.min(26, vault.balance / 15)
        + Math.min(18, savingsRate * 0.28)
        + Math.min(14, vault.streak.count * 1.3),
      ),
    ),
  );

  const healthLabel = healthScore >= 82 ? "Excellent" : healthScore >= 65 ? "Strong" : healthScore >= 45 ? "Building" : "Starting";

  const recentTransactions = useMemo(
    () => vault.transactions.filter((transaction) => {
      if (filter === "all") return true;
      if (filter === "vault") return ["vault_deposit", "vault_withdrawal", "vault_deleted"].includes(transaction.type);
      return transaction.type === filter;
    }).slice(0, 8),
    [vault.transactions, filter],
  );

  const completedGoals = vault.goals.filter((goal) => goal.saved >= goal.target).length;
  const completedVaults = vault.vaults.filter((item) => item.saved >= item.target).length;
  const selectedVault = vault.vaults.find((item) => item.id === selectedVaultId) || null;
  const isVaultPage = activeNav === "vaults";

  const vaultAchievementState = {
    firstVault: Boolean(vault.achievementUnlocks.firstVault) || vault.vaults.length >= 1,
    firstHundredLocked: Boolean(vault.achievementUnlocks.firstHundredLocked) || lockedInVaults >= 100,
    firstCompletedVault: Boolean(vault.achievementUnlocks.firstCompletedVault) || completedVaults >= 1,
    savingStreak7: Boolean(vault.achievementUnlocks.savingStreak7) || vault.savingStreak.count >= 7,
    savingStreak30: Boolean(vault.achievementUnlocks.savingStreak30) || vault.savingStreak.count >= 30,
    bigSaver: Boolean(vault.achievementUnlocks.bigSaver) || vault.vaultStats.totalEverLocked >= 1000 || lockedInVaults >= 1000,
  };

  const categoryTotals = useMemo(() => {
    const sums = Object.fromEntries(CATEGORIES.map((category) => [category.id, 0]));

    vault.transactions
      .filter((item) => item.type === "expense")
      .forEach((item) => {
        sums[item.category] = (sums[item.category] || 0) + item.amount;
      });

    return CATEGORIES
      .map((category) => ({ ...category, amount: sums[category.id] || 0 }))
      .sort((a, b) => b.amount - a.amount);
  }, [vault.transactions]);

  const activeCategoryTotals = categoryTotals.filter((item) => item.amount > 0);

  const dailySpending = useMemo(() => {
    const dates = Array.from({ length: 7 }, (_, index) => new Date(Date.now() - (6 - index) * 86400000));

    return dates.map((date) => {
      const key = dateKey(date);
      const amount = vault.transactions
        .filter((item) => item.type === "expense" && dateKey(item.createdAt) === key)
        .reduce((sum, item) => sum + item.amount, 0);

      return {
        label: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date).slice(0, 1),
        amount,
        isToday: key === dateKey(),
      };
    });
  }, [vault.transactions]);

  const highestDailySpend = Math.max(1, ...dailySpending.map((day) => day.amount));

  const donutStops = useMemo(() => {
    const total = categoryTotals.reduce((sum, item) => sum + item.amount, 0);

    if (!total) return "#1d2940 0deg 360deg";

    let cursor = 0;

    return categoryTotals
      .filter((item) => item.amount > 0)
      .map((item) => {
        const start = cursor;
        cursor += item.amount / total * 360;
        return `${item.color} ${start}deg ${cursor}deg`;
      })
      .join(", ");
  }, [categoryTotals]);

  const achievements = [
    { icon: "⚡", title: "On a roll", text: `${vault.streak.count} day streak`, unlocked: vault.streak.count >= 3 },
    { icon: "✦", title: "Goal getter", text: `${completedGoals} goals complete`, unlocked: completedGoals > 0 },
    { icon: "◈", title: "Cash captain", text: `${formatMoney(vault.balance)} available`, unlocked: vault.balance >= 100 },
    { icon: "◎", title: "Tracker", text: `${vault.transactions.length} money moves`, unlocked: vault.transactions.length >= 5 },
    { icon: "🔐", title: "First Vault Created", text: "Open your first protected Vault", unlocked: vaultAchievementState.firstVault },
    { icon: "💰", title: "First $100 Locked", text: `${formatMoney(lockedInVaults)} safely locked`, unlocked: vaultAchievementState.firstHundredLocked },
    { icon: "🏅", title: "First Completed Vault", text: `${completedVaults} Vaults fully funded`, unlocked: vaultAchievementState.firstCompletedVault },
    { icon: "7", title: "7 Day Saving Streak", text: `${vault.savingStreak.count} saving days`, unlocked: vaultAchievementState.savingStreak7 },
    { icon: "30", title: "30 Day Saving Streak", text: `${vault.savingStreak.count} saving days`, unlocked: vaultAchievementState.savingStreak30 },
    { icon: "✦", title: "Big Saver", text: `${formatMoney(vault.vaultStats.totalEverLocked)} locked over time`, unlocked: vaultAchievementState.bigSaver },
  ];

  function commit(updater) {
    const next = updater(vaultRef.current);
    vaultRef.current = next;
    setVault(next);
    return next;
  }

  function closeModal() {
    setModal(null);
    setSelectedVaultId(null);
  }

  function showToast(title, detail, tone = "success") {
    clearTimeout(toastTimer.current);
    setToast({ title, detail, tone });
    toastTimer.current = setTimeout(() => setToast(null), 4300);
  }

  function navigate(section) {
    setActiveNav(section);
    setPendingNavigation(section);
  }

  function openPurchaseLogger() {
    setActiveNav("dashboard");
    setPendingNavigation("purchases");
  }

  function addMoney(amount, note) {
    const value = safeNumber(amount);

    if (!value) {
      return showToast("Enter an amount", "Add a number bigger than zero to continue.", "error");
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
      ],
    }));

    closeModal();
    showToast("Money added", `${formatMoney(value)} is now ready to use.`);
  }

  function logPurchase(name, amount) {
    const label = name.trim();
    const value = safeNumber(amount);

    if (!label) {
      showToast("Name your purchase", "Tell Money HQ what you bought so your history stays useful.", "error");
      return false;
    }

    if (!value) {
      showToast("Enter an amount", "Add a number bigger than zero to continue.", "error");
      return false;
    }

    if (value > vaultRef.current.balance) {
      showToast("Not enough available", "Add money first or use a smaller amount.", "error");
      return false;
    }

    const before = vaultRef.current;

    const next = commit((current) => {
      if (value > current.balance) return current;

      return {
        ...current,
        balance: current.balance - value,
        transactions: [
          createTransaction({
            label: label.slice(0, 90),
            amount: value,
            direction: -1,
            type: "expense",
            category: "purchases",
            icon: "🛍",
          }),
          ...current.transactions,
        ],
      };
    });

    if (next === before) {
      showToast("Not enough available", "Add money first or use a smaller amount.", "error");
      return false;
    }

    showToast("Purchase logged", `${label} was recorded and ${formatMoney(value)} came off your available balance.`);
    return true;
  }

  function createGoal(name, target, icon) {
    const value = safeNumber(target);

    if (!name.trim() || !value) {
      return showToast("Complete your goal", "Give it a name and target amount.", "error");
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

    closeModal();
    showToast("Goal created", `${name.trim()} is officially on your mission board.`);
  }

  function contributeToGoal(goalId, amount) {
    const value = safeNumber(amount);
    const goal = vault.goals.find((item) => item.id === goalId);

    if (!value || !goal) {
      return showToast("Enter an amount", "Choose how much you want to save.", "error");
    }

    if (value > vault.balance) {
      return showToast("Not enough available", "Add money before sending it to your goal.", "error");
    }

    const remaining = Math.max(0, goal.target - goal.saved);

    if (value > remaining) {
      return showToast("Goal target reached", `${goal.name} only needs ${formatMoney(remaining)} more.`, "error");
    }

    const willComplete = goal.saved + value >= goal.target;

    commit((current) => ({
      ...current,
      balance: current.balance - value,
      goals: current.goals.map((item) => item.id === goalId ? { ...item, saved: item.saved + value } : item),
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
      ],
    }));

    showToast(
      willComplete ? "Goal complete!" : "Savings moved",
      willComplete ? `${goal.name} is fully funded. Huge win.` : `${formatMoney(value)} is working toward ${goal.name}.`,
    );
  }

  function createVault(name, target, icon) {
    const value = safeNumber(target);

    if (!name.trim() || !value) {
      return showToast("Complete your Vault", "Give it a name and a target amount.", "error");
    }

    commit((current) => ({
      ...current,
      vaults: [
        ...current.vaults,
        {
          id: makeId(),
          name: name.trim().slice(0, 60),
          target: value,
          saved: 0,
          icon,
          createdAt: new Date().toISOString(),
          completedAt: null,
        },
      ],
      achievementUnlocks: addAchievement(current.achievementUnlocks, "firstVault"),
    }));

    closeModal();
    showToast("Vault opened", `${name.trim()} is ready to protect your money.`, "vault");
  }

  function updateVault(vaultId, name, target, icon) {
    const currentVault = vault.vaults.find((item) => item.id === vaultId);
    const value = safeNumber(target);

    if (!currentVault || !name.trim() || !value) {
      return showToast("Complete your Vault", "Give it a name and a target amount.", "error");
    }

    if (value < currentVault.saved) {
      return showToast(
        "Target is too low",
        `Your Vault already holds ${formatMoney(currentVault.saved)}. Keep the target at or above that amount.`,
        "error",
      );
    }

    const becomesComplete = currentVault.saved >= value;

    commit((current) => ({
      ...current,
      vaults: current.vaults.map((item) => item.id === vaultId ? {
        ...item,
        name: name.trim().slice(0, 60),
        target: value,
        icon,
        completedAt: becomesComplete ? item.completedAt || new Date().toISOString() : null,
      } : item),
    }));

    closeModal();
    showToast("Vault updated", `${name.trim()} kept its ${formatMoney(currentVault.saved)} balance.`, "vault");
  }

  function requestEditVault(vaultId) {
    setSelectedVaultId(vaultId);
    setModal("edit-vault");
  }

  function requestDeleteVault(vaultId) {
    setSelectedVaultId(vaultId);
    setModal("delete-vault");
  }

  function deleteVault(vaultId) {
    const targetVault = vault.vaults.find((item) => item.id === vaultId);

    if (!targetVault) {
      closeModal();
      return;
    }

    const released = targetVault.saved;

    commit((current) => {
      const currentVault = current.vaults.find((item) => item.id === vaultId);

      if (!currentVault) return current;

      return {
        ...current,
        balance: current.balance + currentVault.saved,
        vaults: current.vaults.filter((item) => item.id !== vaultId),
        transactions: currentVault.saved > 0 ? [
          createTransaction({
            label: `Closed ${currentVault.name} — funds returned`,
            amount: currentVault.saved,
            direction: 1,
            type: "vault_deleted",
            category: "vault",
            icon: currentVault.icon,
            vaultId,
          }),
          ...current.transactions,
        ] : current.transactions,
      };
    });

    closeModal();
    showToast(
      "Vault deleted",
      released > 0 ? `${formatMoney(released)} returned to your available balance.` : `${targetVault.name} was removed.`,
      "vault",
    );
  }

  function fundVault(vaultId, amount) {
    const value = safeNumber(amount);
    const targetVault = vault.vaults.find((item) => item.id === vaultId);

    if (!targetVault || !value) {
      return showToast("Enter an amount", "Choose how much money to lock away.", "error");
    }

    if (fundingVaultId === vaultId) return;

    if (value > vault.balance) {
      return showToast("Not enough available", "Add money before locking it in a Vault.", "error");
    }

    const remaining = Math.max(0, targetVault.target - targetVault.saved);

    if (value > remaining) {
      return showToast("Vault target reached", `This Vault only needs ${formatMoney(remaining)} more.`, "error");
    }

    const completesVault = targetVault.saved < targetVault.target && targetVault.saved + value >= targetVault.target;

    clearTimeout(vaultAnimationTimer.current);
    setFundingVaultId(vaultId);

    commit((current) => {
      const currentVault = current.vaults.find((item) => item.id === vaultId);
      const currentRemaining = currentVault ? Math.max(0, currentVault.target - currentVault.saved) : 0;

      if (!currentVault || value > current.balance || value > currentRemaining) return current;

      const isNowComplete = currentVault.saved < currentVault.target && currentVault.saved + value >= currentVault.target;
      const savingStreak = advanceSavingStreak(current.savingStreak);
      const lockedAfter = current.vaults.reduce((sum, item) => sum + item.saved, 0) + value;
      const totalEverLocked = current.vaultStats.totalEverLocked + value;
      let achievementUnlocks = current.achievementUnlocks;

      if (lockedAfter >= 100) achievementUnlocks = addAchievement(achievementUnlocks, "firstHundredLocked");
      if (isNowComplete) achievementUnlocks = addAchievement(achievementUnlocks, "firstCompletedVault");
      if (savingStreak.count >= 7) achievementUnlocks = addAchievement(achievementUnlocks, "savingStreak7");
      if (savingStreak.count >= 30) achievementUnlocks = addAchievement(achievementUnlocks, "savingStreak30");
      if (totalEverLocked >= 1000) achievementUnlocks = addAchievement(achievementUnlocks, "bigSaver");

      return {
        ...current,
        balance: current.balance - value,
        vaults: current.vaults.map((item) => item.id === vaultId ? {
          ...item,
          saved: item.saved + value,
          completedAt: isNowComplete ? new Date().toISOString() : item.completedAt,
        } : item),
        savingStreak,
        vaultStats: { totalEverLocked },
        achievementUnlocks,
        transactions: [
          createTransaction({
            label: `Locked in ${currentVault.name}`,
            amount: value,
            direction: -1,
            type: "vault_deposit",
            category: "vault",
            icon: currentVault.icon,
            vaultId,
          }),
          ...current.transactions,
        ],
      };
    });

    vaultAnimationTimer.current = setTimeout(() => setFundingVaultId(null), 1500);

    if (completesVault) {
      setVaultCelebration(targetVault);
      showToast("Vault completed", `${targetVault.name} is fully locked and protected.`, "vault");
    } else {
      showToast("Money locked", `${formatMoney(value)} is now protected in ${targetVault.name}.`, "vault");
    }
  }

  function withdrawFromVault(vaultId, amount) {
    const value = safeNumber(amount);
    const targetVault = vault.vaults.find((item) => item.id === vaultId);

    if (!targetVault || !value) {
      return showToast("Enter an amount", "Choose how much money to withdraw.", "error");
    }

    if (value > targetVault.saved) {
      return showToast("Not enough locked", `${targetVault.name} only has ${formatMoney(targetVault.saved)} available.`, "error");
    }

    commit((current) => {
      const currentVault = current.vaults.find((item) => item.id === vaultId);

      if (!currentVault || value > currentVault.saved) return current;

      return {
        ...current,
        balance: current.balance + value,
        vaults: current.vaults.map((item) => item.id === vaultId ? {
          ...item,
          saved: item.saved - value,
          completedAt: item.saved - value >= item.target ? item.completedAt : null,
        } : item),
        transactions: [
          createTransaction({
            label: `Withdrew from ${currentVault.name}`,
            amount: value,
            direction: 1,
            type: "vault_withdrawal",
            category: "vault",
            icon: currentVault.icon,
            vaultId,
          }),
          ...current.transactions,
        ],
      };
    });

    showToast("Funds unlocked", `${formatMoney(value)} returned to your available balance.`, "vault");
  }

  const pageHeading = isVaultPage ? {
    eyebrow: "PROTECTED SAVINGS",
    title: "Your Vaults",
    copy: "Every reserve is separate, intentional, and ready for its next big move.",
  } : {
    eyebrow: "PERSONAL FINANCE, REIMAGINED",
    title: "Good afternoon, Builder.",
    copy: "Your money is organized. Your next move is yours.",
  };

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
              className={`nav-item ${activeNav === id ? "active" : ""} ${id === "vaults" ? "vault-nav" : ""}`}
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
        <header className={`topbar ${isVaultPage ? "vault-topbar" : ""}`}>
          <div>
            <p className={`eyebrow ${isVaultPage ? "vault-eyebrow" : ""}`}>{pageHeading.eyebrow}</p>
            <h1>{pageHeading.title}</h1>
            <p className="topbar-copy">{pageHeading.copy}</p>
          </div>

          <div className="top-actions">
            <button className="icon-button notification" aria-label="Notifications">♢<i /></button>
            <button className="profile-button" aria-label="Open profile">
              <span className="avatar">BB</span>
              <span>⌄</span>
            </button>
          </div>
        </header>

        {isVaultPage ? (
          <VaultPage
            vaults={vault.vaults}
            lockedInVaults={lockedInVaults}
            totalVaultTarget={totalVaultTarget}
            completedVaults={completedVaults}
            availableBalance={vault.balance}
            fundingVaultId={fundingVaultId}
            onCreate={() => setModal("vault")}
            onFund={fundVault}
            onWithdraw={withdrawFromVault}
            onEdit={requestEditVault}
            onDelete={requestDeleteVault}
          />
        ) : (
          <>
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
                  <button className="hero-menu" aria-label="Balance options">•••</button>
                </div>

                <div className="hero-stat-row">
                  <span><b>↗</b> Income <strong>{formatMoney(income)}</strong></span>
                  <span><b>↘</b> Purchases <strong>{formatMoney(expenses)}</strong></span>
                </div>

                <div className="hero-actions">
                  <button className="primary-action" onClick={() => setModal("add")}>↗ Add money</button>
                  <button className="secondary-action" onClick={openPurchaseLogger}>🛍 Log purchase</button>
                  <button className="ghost-action" onClick={() => setModal("goal")}>+ New goal</button>
                </div>
              </motion.article>

              <article className="health-card">
                <div className="health-copy">
                  <p className="eyebrow">FINANCIAL HEALTH</p>
                  <h2>{healthLabel}</h2>
                  <p>Healthy habits are compounding.</p>
                  <span>+{Math.min(12, Math.max(1, vault.streak.count))} this week</span>
                </div>

                <div className="health-ring" style={{ "--score": `${healthScore * 3.6}deg` }}>
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
                  <small>{income ? "All incoming money" : "Add money to begin"}</small>
                </div>
              </article>

              <article className="metric-card">
                <div className="metric-icon savings">✦</div>
                <div>
                  <span>In your goals</span>
                  <strong>{formatMoney(savings)}</strong>
                  <small>{totalGoalTarget ? `${Math.round(savings / totalGoalTarget * 100)}% of all targets` : "Create a savings goal"}</small>
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

            <PurchasePanel balance={vault.balance} onSubmit={logPurchase} />

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
                      <span className="bar-tooltip">{formatMoney(day.amount)}</span>
                      <div
                        className={day.isToday ? "bar active" : "bar"}
                        style={{ height: `${Math.max(day.amount ? 12 : 4, day.amount / highestDailySpend * 100)}%` }}
                      />
                      <small>{day.label}</small>
                    </div>
                  ))}
                </div>

                <div className="chart-footer">
                  <span><i className="chart-dot" /> Purchases</span>
                  <strong>{formatMoney(expenses)} total tracked</strong>
                </div>
              </article>

              <article className="panel category-panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">SPENDING BREAKDOWN</p>
                    <h2>Where it went</h2>
                  </div>
                  <button className="text-button" onClick={() => navigate("activity")}>View activity</button>
                </div>

                <div className="donut-layout">
                  <div className="donut" style={{ background: `conic-gradient(${donutStops})` }}>
                    <div>
                      <strong>{formatShortMoney(expenses)}</strong>
                      <small>spent</small>
                    </div>
                  </div>

                  <div className="category-legend">
                    {activeCategoryTotals.length ? activeCategoryTotals.slice(0, 4).map((category) => (
                      <div key={category.id}>
                        <span><i style={{ background: category.color }} />{category.label}</span>
                        <strong>{formatMoney(category.amount)}</strong>
                      </div>
                    )) : (
                      <p className="category-empty">Log a purchase to see your spending here.</p>
                    )}
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
                <button className="text-button" onClick={() => setModal("goal")}>+ Create goal</button>
              </div>

              {vault.goals.length === 0 ? (
                <div className="empty-goals">
                  <div>✦</div>
                  <h3>Give your money a mission.</h3>
                  <p>Create a goal for something worth working toward, then move money into it whenever you can.</p>
                  <button className="primary-action" onClick={() => setModal("goal")}>Create your first goal</button>
                </div>
              ) : (
                <div className="goal-grid">
                  {vault.goals.map((goal) => (
                    <GoalCard key={goal.id} goal={goal} balance={vault.balance} onContribute={contributeToGoal} />
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
                      ["expense", "Purchases"],
                      ["saving", "Goals"],
                      ["vault", "Vault"],
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
                    <p>Every add, purchase, goal move, and Vault transfer will appear in your private ledger.</p>
                    <button className="text-button" onClick={() => setModal("add")}>Add your first money move</button>
                  </div>
                ) : (
                  <div className="transaction-list">
                    {recentTransactions.map((transaction) => (
                      <TransactionRow key={transaction.id} transaction={transaction} />
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
                  <span className="achievement-count">{achievements.filter((item) => item.unlocked).length}/{achievements.length}</span>
                </div>

                <div className="achievement-list">
                  {achievements.map((achievement) => (
                    <div className={achievement.unlocked ? "achievement unlocked" : "achievement"} key={achievement.title}>
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
          </>
        )}
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {NAV_ITEMS.map(([id, icon, label]) => (
          <button
            key={id}
            className={`${activeNav === id ? "active" : ""} ${id === "vaults" ? "vault-mobile-nav" : ""}`}
            onClick={() => navigate(id)}
          >
            <span>{icon}</span>
            <small>{label}</small>
          </button>
        ))}
      </nav>

      <AnimatePresence>
        {modal === "add" && <AddMoneyModal onClose={closeModal} onSubmit={addMoney} />}
        {modal === "goal" && <GoalModal onClose={closeModal} onSubmit={createGoal} />}
        {modal === "vault" && <VaultModal key="new-vault" onClose={closeModal} onSubmit={createVault} />}
        {modal === "edit-vault" && selectedVault && (
          <VaultModal
            key={`edit-${selectedVault.id}`}
            vault={selectedVault}
            onClose={closeModal}
            onSubmit={(name, target, icon) => updateVault(selectedVault.id, name, target, icon)}
          />
        )}
        {modal === "delete-vault" && selectedVault && (
          <DeleteVaultModal
            vault={selectedVault}
            onClose={closeModal}
            onConfirm={() => deleteVault(selectedVault.id)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {vaultCelebration && <VaultCelebration vault={vaultCelebration} onClose={() => setVaultCelebration(null)} />}
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
            <button onClick={() => setToast(null)} aria-label="Dismiss message">×</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PurchasePanel({ balance, onSubmit }) {
  const [purchase, setPurchase] = useState("");
  const [amount, setAmount] = useState("");

  function submit(event) {
    event.preventDefault();

    if (onSubmit(purchase, amount)) {
      setPurchase("");
      setAmount("");
    }
  }

  return (
    <section id="purchases-section" className="purchase-panel panel section-anchor" aria-labelledby="purchase-title">
      <div className="purchase-panel-copy">
        <p className="eyebrow">QUICK CASH CHECK</p>
        <h2 id="purchase-title">Log a Purchase</h2>
        <p>Type what you bought and what it cost. Money HQ subtracts it from your available balance and saves it to your history.</p>

        <div className="purchase-balance">
          <span>Available now</span>
          <strong>{formatMoney(balance)}</strong>
        </div>
      </div>

      <form className="purchase-form" onSubmit={submit}>
        <label className="field" htmlFor="purchase-name">
          <span>What did you purchase?</span>
          <input
            id="purchase-name"
            value={purchase}
            onChange={(event) => setPurchase(event.target.value)}
            placeholder="Coffee, new shoes, game..."
            maxLength="90"
          />
        </label>

        <AmountInput
          id="purchase-amount"
          label="How much did you spend?"
          value={amount}
          onChange={setAmount}
        />

        <button className="purchase-submit" type="submit">Log purchase <span>↘</span></button>
        <p className="purchase-note">No categories to choose. Just log it and keep moving.</p>
      </form>
    </section>
  );
}

function VaultPage({
  vaults,
  lockedInVaults,
  totalVaultTarget,
  completedVaults,
  availableBalance,
  fundingVaultId,
  onCreate,
  onFund,
  onWithdraw,
  onEdit,
  onDelete,
}) {
  return (
    <section id="vaults-section" className="vault-page section-anchor">
      <motion.article
        className="vault-hero"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42 }}
      >
        <div className="vault-hero-light one" />
        <div className="vault-hero-light two" />

        <div className="vault-hero-top">
          <div>
            <p className="eyebrow vault-eyebrow">THE VAULT</p>
            <h2>Protected savings, built for your next big move.</h2>
            <p>Your Vault money stays separate from your everyday balance until you decide to unlock it.</p>
          </div>
          <span className="vault-emblem">🔐</span>
        </div>

        <div className="vault-overview">
          <div><small>Total locked</small><strong>{formatMoney(lockedInVaults)}</strong></div>
          <div><small>Open Vaults</small><strong>{vaults.length}</strong></div>
          <div><small>Completed</small><strong>{completedVaults}</strong></div>
          <div><small>Vault progress</small><strong>{totalVaultTarget ? `${Math.round(lockedInVaults / totalVaultTarget * 100)}%` : "0%"}</strong></div>
        </div>

        <button className="vault-create-button" onClick={onCreate}>+ Open a Vault</button>
      </motion.article>

      <article className="panel vault-library">
        <div className="panel-header">
          <div>
            <p className="eyebrow vault-eyebrow">YOUR PRIVATE RESERVES</p>
            <h2>Vaults</h2>
          </div>
          <button className="text-button vault-text-button" onClick={onCreate}>+ Create Vault</button>
        </div>

        {vaults.length === 0 ? (
          <div className="empty-vaults">
            <div className="empty-vault-lock">🔒</div>
            <h3>Open your first Vault.</h3>
            <p>Set money aside for the things you want to protect from everyday spending.</p>
            <button className="vault-create-button" onClick={onCreate}>Create a Vault</button>
          </div>
        ) : (
          <div className="vault-grid">
            {vaults.map((item) => (
              <VaultCard
                key={item.id}
                vault={item}
                availableBalance={availableBalance}
                isFunding={fundingVaultId === item.id}
                onFund={onFund}
                onWithdraw={onWithdraw}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </article>
    </section>
  );
}

function GoalCard({ goal, balance, onContribute }) {
  const [amount, setAmount] = useState("");
  const progress = Math.min(100, Math.round(goal.saved / goal.target * 100));
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
        <span className={complete ? "goal-status complete" : "goal-status"}>{complete ? "Complete" : `${progress}% funded`}</span>
      </div>

      <h3>{goal.name}</h3>
      <p><strong>{formatMoney(goal.saved)}</strong> of {formatMoney(goal.target)}</p>
      <div className="progress-track" aria-label={`${goal.name} is ${progress}% funded`}>
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
        <button type="submit" disabled={complete || balance <= 0}>{complete ? "Funded" : "Save"}</button>
      </form>
    </article>
  );
}

function VaultCard({ vault, availableBalance, isFunding, onFund, onWithdraw, onEdit, onDelete }) {
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("lock");
  const progress = Math.min(100, Math.round(vault.saved / vault.target * 100));
  const completed = progress >= 100;
  const created = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(vault.createdAt));

  function submit(event) {
    event.preventDefault();

    if (mode === "lock") onFund(vault.id, amount);
    else onWithdraw(vault.id, amount);

    setAmount("");
  }

  return (
    <motion.article
      className={`vault-card ${completed ? "completed" : ""} ${isFunding ? "funding" : ""}`}
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{ y: -5 }}
      transition={{ type: "spring", stiffness: 280, damping: 23 }}
    >
      <div className="vault-card-glow" />

      {isFunding && (
        <motion.div
          className="vault-lock-flash"
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: [0, 1, 0], scale: [0.7, 1.1, 1.35] }}
          transition={{ duration: 0.85 }}
        >
          🔒
        </motion.div>
      )}

      <div className="vault-card-head">
        <span className="vault-card-icon">{vault.icon}</span>
        <div>
          <span className={completed ? "vault-state complete" : "vault-state"}>{completed ? "Vault Completed" : "Locked"}</span>
          <small>Opened {created}</small>
        </div>
      </div>

      <h3>{vault.name}</h3>
      <div className="vault-amount">
        <strong>{formatMoney(vault.saved)}</strong>
        <span>/ {formatMoney(vault.target)}</span>
      </div>

      <div className="vault-progress">
        <i style={{ width: `${progress}%` }} />
      </div>

      <div className="vault-card-meta">
        <span>{progress}% protected</span>
        <span>{formatMoney(Math.max(0, vault.target - vault.saved))} remaining</span>
      </div>

      <div className="vault-card-tools">
        <button className="vault-card-edit" type="button" onClick={() => onEdit(vault.id)}>Edit</button>
        <button className="vault-card-delete" type="button" onClick={() => onDelete(vault.id)}>Delete</button>
      </div>

      <form className="vault-action-form" onSubmit={submit}>
        <div className="vault-mode-switch">
          <button type="button" className={mode === "lock" ? "active" : ""} onClick={() => setMode("lock")}>Lock money</button>
          <button type="button" className={mode === "withdraw" ? "active" : ""} onClick={() => setMode("withdraw")}>Withdraw</button>
        </div>

        <div className="vault-amount-input">
          <span>$</span>
          <input
            aria-label={`Amount to ${mode === "lock" ? "lock into" : "withdraw from"} ${vault.name}`}
            inputMode="decimal"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
          />
        </div>

        <button className="vault-action-button" type="submit" disabled={mode === "lock" ? completed || availableBalance <= 0 : vault.saved <= 0}>
          {mode === "lock" ? "Lock securely" : "Unlock funds"}
        </button>
      </form>
    </motion.article>
  );
}

function VaultCelebration({ vault, onClose }) {
  const particles = Array.from({ length: 18 }, (_, index) => index);

  return (
    <motion.div
      className="vault-celebration"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label="Vault completed"
      onMouseDown={onClose}
    >
      <div className="vault-particles" aria-hidden="true">
        {particles.map((particle) => (
          <motion.i
            key={particle}
            style={{ "--particle": particle }}
            initial={{ opacity: 0, x: 0, y: 0, scale: 0.2 }}
            animate={{
              opacity: [0, 1, 0],
              x: ((particle % 6) - 2.5) * 42,
              y: -80 - (particle % 4) * 32,
              rotate: particle * 36,
              scale: [0.2, 1, 0.35],
            }}
            transition={{ duration: 1.35, delay: particle * 0.025, ease: "easeOut" }}
          />
        ))}
      </div>

      <motion.section
        className="vault-complete-card"
        initial={{ opacity: 0, y: 18, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 280, damping: 22 }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <motion.span
          animate={{ rotate: [0, -8, 8, 0], scale: [1, 1.13, 1] }}
          transition={{ duration: 1.1, repeat: Infinity, repeatDelay: 1.6 }}
        >
          🏅
        </motion.span>

        <p className="eyebrow vault-eyebrow">VAULT ACHIEVEMENT UNLOCKED</p>
        <h2>Vault Completed</h2>
        <p><strong>{vault.name}</strong> is fully funded, securely locked, and ready when you are.</p>
        <button className="vault-create-button" onClick={onClose}>Securely close</button>
      </motion.section>
    </motion.div>
  );
}

function TransactionRow({ transaction }) {
  const isPositive = transaction.direction > 0;
  const category = transaction.type === "expense" ? categoryFor(transaction.category) : null;
  const isVaultTransfer = ["vault_deposit", "vault_withdrawal", "vault_deleted"].includes(transaction.type);

  const detail = transaction.type === "expense"
    ? category?.label || "Purchase"
    : transaction.type === "saving"
      ? "Goal contribution"
      : transaction.type === "vault_deleted"
        ? "Vault closed"
        : isVaultTransfer
          ? "Vault transfer"
          : "Income";

  const action = isPositive
    ? transaction.type === "vault_deleted"
      ? "Returned"
      : isVaultTransfer
        ? "Unlocked"
        : "Added"
    : transaction.type === "saving"
      ? "Saved"
      : isVaultTransfer
        ? "Locked"
        : "Spent";

  return (
    <div className="transaction-row">
      <div className={
        isPositive
          ? "transaction-icon positive"
          : transaction.type === "saving"
            ? "transaction-icon saving"
            : isVaultTransfer
              ? "transaction-icon vault-transaction"
              : "transaction-icon"
      }>
        {transaction.icon}
      </div>

      <div className="transaction-info">
        <strong>{transaction.label}</strong>
        <span>{detail} · {transactionDate(transaction.createdAt)}</span>
      </div>

      <div className={isPositive ? "transaction-amount positive" : "transaction-amount"}>
        <strong>{isPositive ? "+" : "−"}{formatMoney(transaction.amount)}</strong>
        <span>{action}</span>
      </div>
    </div>
  );
}

function AddMoneyModal({ onClose, onSubmit }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  return (
    <Modal title="Add money" subtitle="Record income, a deposit, or cash you received." onClose={onClose}>
      <form className="modal-form" onSubmit={(event) => {
        event.preventDefault();
        onSubmit(amount, note);
      }}>
        <AmountInput id="add-money-amount" label="Amount" value={amount} onChange={setAmount} />

        <label className="field" htmlFor="add-money-note">
          <span>Note <em>Optional</em></span>
          <input
            id="add-money-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Paycheck, allowance, sold something..."
            maxLength="90"
          />
        </label>

        <button className="primary-action full" type="submit">Add to available balance <span>↗</span></button>
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
    <Modal title="Create a goal" subtitle="Turn a future purchase into a clear plan." onClose={onClose}>
      <form className="modal-form" onSubmit={(event) => {
        event.preventDefault();
        onSubmit(name, target, icon);
      }}>
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

        <AmountInput id="goal-target" label="Target amount" value={target} onChange={setTarget} />

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

        <button className="primary-action full" type="submit">Create goal <span>✦</span></button>
      </form>
    </Modal>
  );
}

function VaultModal({ vault, onClose, onSubmit }) {
  const isEdit = Boolean(vault);
  const [name, setName] = useState(vault?.name || "");
  const [target, setTarget] = useState(vault ? String(vault.target) : "");
  const [icon, setIcon] = useState(vault?.icon || "🔒");
  const icons = ["🚗", "🏠", "🎮", "✈️", "💰", "🏎️", "🔒", "💎"];

  return (
    <Modal
      title={isEdit ? "Edit Vault" : "Open a Vault"}
      subtitle={isEdit ? "Update the details without touching the money already protected." : "Create a private reserve for money you want to protect."}
      onClose={onClose}
    >
      <form className="modal-form vault-modal-form" onSubmit={(event) => {
        event.preventDefault();
        onSubmit(name, target, icon);
      }}>
        <div className="vault-modal-seal">
          <span>{icon}</span>
          <div>
            <small>{isEdit ? "Protected balance stays intact" : "Private reserve"}</small>
            <strong>{isEdit ? `${formatMoney(vault.saved)} remains in this Vault` : "Protected by Money HQ"}</strong>
          </div>
        </div>

        <label className="field" htmlFor="vault-name">
          <span>Name your Vault</span>
          <input
            id="vault-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Car Fund, Emergency Fund..."
            maxLength="60"
            autoFocus
          />
        </label>

        <AmountInput id="vault-target" label="Target amount" value={target} onChange={setTarget} />

        {isEdit && (
          <p className="vault-edit-note">
            The target can be raised, but it cannot be lower than the {formatMoney(vault.saved)} already locked.
          </p>
        )}

        <fieldset className="icon-chooser vault-icon-chooser">
          <legend>Choose a Vault icon</legend>
          <div>
            {icons.map((item) => (
              <button
                className={icon === item ? "active" : ""}
                type="button"
                key={item}
                onClick={() => setIcon(item)}
                aria-label={`Use ${item} as the Vault icon`}
              >
                {item}
              </button>
            ))}
          </div>
        </fieldset>

        <button className="vault-create-button full" type="submit">
          {isEdit ? "Save Vault changes" : "Open secure Vault"} <span>{isEdit ? "✓" : "🔐"}</span>
        </button>
      </form>
    </Modal>
  );
}

function DeleteVaultModal({ vault, onClose, onConfirm }) {
  const hasMoney = vault.saved > 0;

  return (
    <Modal title="Delete this Vault?" subtitle="This action removes the Vault, but never loses your locked money." onClose={onClose}>
      <div className="delete-vault-copy">
        <span>{vault.icon}</span>
        <div>
          <small>{vault.name}</small>
          <strong>{hasMoney ? `${formatMoney(vault.saved)} will return to your available balance.` : "This Vault is empty and can be removed safely."}</strong>
        </div>
      </div>

      <div className="modal-actions">
        <button className="secondary-action" type="button" onClick={onClose}>Keep Vault</button>
        <button className="danger-action" type="button" onClick={onConfirm}>Delete Vault</button>
      </div>
    </Modal>
  );
}

createRoot(document.getElementById("root")).render(<App />);
