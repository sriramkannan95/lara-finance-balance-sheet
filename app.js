// ============================================================================
// CashFlow Pulse — Complete Application Logic
// ============================================================================

import {
  initFirebase,
  signIn as firebaseSignIn,
  signOutUser as firebaseSignOut,
  saveToCloud,
  loadFromCloud,
  migrateLocalToCloud,
  onDataChange,
  isSignedIn,
  getUser,
  FIREBASE_ENABLED
} from './firebase-sync.js';

// ---------------------------------------------------------------------------
// Constants & Defaults
// ---------------------------------------------------------------------------
const DEFAULT_SETTINGS = {
  safetyBuffer: 20000,
  defaultSalary: 142000
};

const STORAGE_KEY = 'cashflow_pulse_data';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

/**
 * Format a number in the Indian numbering system: ₹XX,XX,XXX
 */
function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return '₹0';
  const negative = amount < 0;
  let num = Math.abs(Math.round(amount));
  let str = num.toString();
  let result = '';

  // Last 3 digits
  if (str.length > 3) {
    result = ',' + str.slice(-3);
    str = str.slice(0, -3);
  } else {
    return (negative ? '-₹' : '₹') + str;
  }

  // Then groups of 2
  while (str.length > 2) {
    result = ',' + str.slice(-2) + result;
    str = str.slice(0, -2);
  }

  result = str + result;
  return (negative ? '-₹' : '₹') + result;
}

/**
 * Compact format for chart axis: ₹1.4L, ₹50K, etc.
 */
function formatCompact(amount) {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 100000) {
    const lakhs = abs / 100000;
    return sign + '₹' + (lakhs % 1 === 0 ? lakhs.toFixed(0) : lakhs.toFixed(1)) + 'L';
  }
  if (abs >= 1000) {
    const thousands = abs / 1000;
    return sign + '₹' + (thousands % 1 === 0 ? thousands.toFixed(0) : thousands.toFixed(1)) + 'K';
  }
  return sign + '₹' + abs;
}

/**
 * Format ISO date string as '4 Jun'
 */
function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.getDate() + ' ' + MONTH_NAMES_SHORT[d.getMonth()];
}

/**
 * Get the number of days in a given month (0-indexed month).
 */
function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Check if a date string matches today.
 */
function isToday(dateStr) {
  const today = new Date();
  const todayStr =
    today.getFullYear() + '-' +
    String(today.getMonth() + 1).padStart(2, '0') + '-' +
    String(today.getDate()).padStart(2, '0');
  return dateStr === todayStr;
}

/**
 * Check if a date string is in the past.
 */
function isPast(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  return d < today;
}

/**
 * Generate a simple unique ID.
 */
function generateId() {
  return 'ot_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

/**
 * Show a toast notification for 2.5 seconds.
 */
function showToast(message) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText =
      'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.textContent = message;
  toast.style.cssText =
    'background:var(--card-bg,#1e1e2e);color:var(--text-primary,#fff);padding:12px 24px;border-radius:12px;' +
    'font-size:0.9rem;box-shadow:0 8px 24px rgba(0,0,0,0.4);border:1px solid var(--border,#333);' +
    'opacity:0;transform:translateY(12px);transition:all 0.3s ease;pointer-events:auto;';
  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(12px)';
    setTimeout(() => toast.remove(), 350);
  }, 2500);
}

/**
 * Animate a numeric value changing in an element (counting up/down).
 */
function animateValue(element, start, end, duration) {
  if (!element) return;
  const startTime = performance.now();
  const diff = end - start;

  function step(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + diff * eased);
    element.textContent = formatCurrency(current);
    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}

// ---------------------------------------------------------------------------
// Monthly Transaction Template Generator
// ---------------------------------------------------------------------------

/**
 * Generate recurring monthly transactions for a given year/month (0-indexed).
 */
function generateMonthlyTemplate(year, month) {
  const transactions = [
    { id: 'lavanya', day: 1, description: 'Lavanya Contribution', billDate: null, category: 'Income', type: 'inflow', amount: 35000, editable: true, isFixed: true },
    { id: 'idfc', day: 3, description: 'IDFC Card Auto-Pay', billDate: '22nd prev month', billGenDay: 22, billGenMonth: 'prev', category: 'Credit Card', type: 'outflow', amount: 0, editable: true, isFixed: false },
    { id: 'sbi_sriram', day: 4, description: 'SBI Sriram Auto-Pay', billDate: '18th prev month', billGenDay: 18, billGenMonth: 'prev', category: 'Credit Card', type: 'outflow', amount: 0, editable: true, isFixed: false },
    { id: 'dad', day: 5, description: 'Dad Allowance', billDate: null, category: 'Income', type: 'inflow', amount: 40000, editable: true, isFixed: true },
    { id: 'emi', day: 31, description: 'House EMI', billDate: null, category: 'Debt', type: 'outflow', amount: 70000, editable: true, isFixed: true },
    { id: 'sips', day: 12, description: 'SIPs', billDate: null, category: 'Investment', type: 'outflow', amount: 10000, editable: true, isFixed: true },
    { id: 'rd', day: 17, description: 'Recurring Deposit', billDate: null, category: 'Investment', type: 'outflow', amount: 3900, editable: true, isFixed: true },
    { id: 'icici', day: 17, description: 'ICICI Cards Auto-Pay', billDate: '2nd curr month', billGenDay: 2, billGenMonth: 'curr', category: 'Credit Card', type: 'outflow', amount: 0, editable: true, isFixed: false },
    { id: 'sbi_lava', day: 20, description: 'SBI Lava Auto-Pay', billDate: '3rd curr month', billGenDay: 3, billGenMonth: 'curr', category: 'Credit Card', type: 'outflow', amount: 0, editable: true, isFixed: false },
    { id: 'hdfc', day: 29, description: 'HDFC Card Auto-Pay', billDate: '13th curr month', billGenDay: 13, billGenMonth: 'curr', category: 'Credit Card', type: 'outflow', amount: 0, editable: true, isFixed: false },
    { id: 'salary', day: 1, description: 'Salary', billDate: null, category: 'Income', type: 'inflow', amount: 142000, editable: true, isFixed: true }
  ];

  const daysInMonth = getDaysInMonth(year, month);
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;

  return transactions.map(t => {
    const actualDay = Math.min(t.day, daysInMonth);
    const date = new Date(year, month, actualDay);
    const dateStr =
      date.getFullYear() + '-' +
      String(date.getMonth() + 1).padStart(2, '0') + '-' +
      String(date.getDate()).padStart(2, '0');

    let description = t.description;
    if (t.billDate) {
      const billDayMatch = t.billDate.match(/\d+/);
      const billDay = billDayMatch ? billDayMatch[0] : '';
      if (t.billDate.includes('prev')) {
        description += ' (Bill: ' + billDay + ' ' + MONTH_NAMES_SHORT[prevMonth] + ')';
      } else {
        description += ' (Bill: ' + billDay + ' ' + MONTH_NAMES_SHORT[month] + ')';
      }
    }

    const result = {
      id: t.id,
      date: dateStr,
      description: description,
      category: t.category,
      type: t.type,
      amount: t.amount,
      editable: t.editable,
      isFixed: t.isFixed,
      paidEarly: false
    };
    if (t.billGenDay) result.billGenDay = t.billGenDay;
    if (t.billGenMonth) result.billGenMonth = t.billGenMonth;
    return result;
  });
}

// ---------------------------------------------------------------------------
// CashFlowApp Class
// ---------------------------------------------------------------------------

class CashFlowApp {
  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------
  constructor() {
    this.state = null;
    this.readonlyMode = false;
    this.readonlyData = null;
    this.chartTooltipEl = null;
    this.previousCardValues = { inflow: 0, outflow: 0, lowest: 0, excess: 0 };

    // Detect readonly mode from URL
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'readonly' && params.get('data')) {
      this.readonlyMode = true;
      this.loadReadOnly(params.get('data'));
    } else {
      this.loadData();
    }

    // Determine current viewing month
    const now = new Date();
    this.currentMonth = { year: now.getFullYear(), month: now.getMonth() };

    this.ensureMonth(this.getMonthKey(this.currentMonth.year, this.currentMonth.month));
    this.bindEvents();
    this.render();

    if (this.readonlyMode) {
      document.body.classList.add('readonly');
      this.showReadOnlyBanner();
    }

    // Initialize Firebase (async, non-blocking)
    this.initFirebaseSync();
  }

  /**
   * Initialize Firebase and set up cloud sync.
   */
  async initFirebaseSync() {
    if (this.readonlyMode) return;

    const success = await initFirebase();
    if (!success) return;

    // Bind auth UI buttons
    const signInBtn = document.getElementById('googleSignInBtn');
    if (signInBtn) {
      signInBtn.addEventListener('click', () => this.handleSignIn());
    }
    const signOutBtn = document.getElementById('signOutBtn');
    if (signOutBtn) {
      signOutBtn.addEventListener('click', () => this.handleSignOut());
    }

    // Listen for real-time data changes from other devices
    onDataChange((cloudState, timestamp) => {
      this.handleCloudData(cloudState, timestamp);
    });
  }

  /**
   * Handle Google sign-in and migrate local data to cloud.
   */
  async handleSignIn() {
    try {
      const user = await firebaseSignIn();
      if (!user) return;

      // Migrate local data to cloud (or load cloud data)
      const resolvedState = await migrateLocalToCloud(this.state);
      if (resolvedState) {
        this.state = resolvedState;
        this.migrateData();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
        this.render();
        showToast('Signed in as ' + user.displayName + '! Data synced.');
      }
    } catch (error) {
      showToast('Sign-in failed. Please try again.');
    }
  }

  /**
   * Handle sign out.
   */
  async handleSignOut() {
    await firebaseSignOut();
    showToast('Signed out. Using local data only.');
  }

  /**
   * Handle incoming data from cloud (real-time sync from another device).
   */
  handleCloudData(cloudState, timestamp) {
    // Replace local state with cloud state
    this.state = cloudState;
    this.migrateData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));

    // Re-ensure current month exists
    this.ensureMonth(this.getMonthKey(this.currentMonth.year, this.currentMonth.month));
    this.render();
    showToast('Data updated from another device.');
  }

  /**
   * Migrate existing months to the new cycle layout (Salary on Day 1, EMI on Day 30/31, RD on Day 17).
   */
  migrateData() {
    if (!this.state || !this.state.months) return;

    let modified = false;

    Object.keys(this.state.months).forEach(monthKey => {
      const monthData = this.state.months[monthKey];
      if (!monthData || !monthData.transactions) return;

      const [year, month] = monthKey.split('-').map(Number); // month is 1-indexed (1-12)
      const m0 = month - 1; // 0-indexed month
      const daysInMonth = getDaysInMonth(year, m0);

      monthData.transactions.forEach(tx => {
        // Migrate salary from Day 30 to Day 1
        if (tx.id === 'salary') {
          const expectedDate = year + '-' + String(month).padStart(2, '0') + '-01';
          if (tx.date !== expectedDate) {
            tx.date = expectedDate;
            modified = true;
          }
        }

        // Migrate House EMI from Day 5 to Day 30/31 (last day of the month)
        if (tx.id === 'emi') {
          const expectedDate = year + '-' + String(month).padStart(2, '0') + '-' + String(daysInMonth).padStart(2, '0');
          if (tx.date !== expectedDate) {
            tx.date = expectedDate;
            modified = true;
          }
        }

        // Migrate RD from Day 15 to Day 17
        if (tx.id === 'rd') {
          const expectedDate = year + '-' + String(month).padStart(2, '0') + '-17';
          if (tx.date !== expectedDate) {
            tx.date = expectedDate;
            modified = true;
          }
        }
      });
    });

    if (modified) {
      this.saveData();
    }
  }

  /**
   * Load state from localStorage, or initialize a fresh state.
   */
  loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.state = JSON.parse(raw);
        // Ensure settings exist
        if (!this.state.settings) {
          this.state.settings = { ...DEFAULT_SETTINGS };
        }
        if (!this.state.months) {
          this.state.months = {};
        }
        // Run migration to shift salary/EMI/RD dates in existing months
        this.migrateData();
      } else {
        this.initFreshState();
      }
    } catch (e) {
      console.error('Failed to load data, initializing fresh state:', e);
      this.initFreshState();
    }
  }

  /**
   * Initialize a brand-new state object.
   */
  initFreshState() {
    this.state = {
      settings: { ...DEFAULT_SETTINGS },
      months: {}
    };
    this.saveData();
  }

  /**
   * Save state to localStorage.
   */
  saveData() {
    if (this.readonlyMode) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.error('Failed to save data:', e);
    }

    // Also push to cloud if signed in
    if (isSignedIn()) {
      // Debounce cloud saves to avoid excessive writes
      clearTimeout(this._cloudSaveTimer);
      this._cloudSaveTimer = setTimeout(() => {
        saveToCloud(this.state);
      }, 1000);
    }
  }

  /**
   * Return a month key string 'YYYY-MM'.
   */
  getMonthKey(year, month) {
    return year + '-' + String(month + 1).padStart(2, '0');
  }

  /**
   * Ensure a month exists in the state; if not, generate its template.
   */
  ensureMonth(monthKey) {
    if (this.readonlyMode) return;
    if (!this.state.months[monthKey]) {
      const [y, m] = monthKey.split('-').map(Number);
      this.state.months[monthKey] = {
        bankBalance: this.computeCarryForwardBalance(y, m - 1),
        transactions: generateMonthlyTemplate(y, m - 1),
        prepayment: { loanPrepay: 0, extraMF: 0 },
        oneTimeEntries: []
      };
      this.saveData();
    }
  }

  /**
   * Compute carry-forward balance from the previous month.
   * If previous month data exists, use its projected ending balance.
   * Otherwise default to 0.
   */
  computeCarryForwardBalance(year, month) {
    // month is 0-indexed
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const prevKey = this.getMonthKey(prevYear, prevMonth);

    if (this.state.months[prevKey]) {
      const prevData = this.state.months[prevKey];
      const projection = this.computeProjectionForMonth(prevData, prevYear, prevMonth);
      const lastBalance = projection.dailyBalances[projection.dailyBalances.length - 1];
      return lastBalance ? lastBalance.balance : 0;
    }

    return 0;
  }

  // -------------------------------------------------------------------------
  // State Management
  // -------------------------------------------------------------------------

  /**
   * Return the month data object for the current viewing month.
   */
  getCurrentMonthData() {
    const key = this.getMonthKey(this.currentMonth.year, this.currentMonth.month);
    if (this.readonlyMode && this.readonlyData) {
      return this.readonlyData;
    }
    this.ensureMonth(key);
    return this.state.months[key];
  }

  /**
   * Navigate forward or backward by delta months, then re-render.
   */
  navigateMonth(delta) {
    let newMonth = this.currentMonth.month + delta;
    let newYear = this.currentMonth.year;

    while (newMonth < 0) {
      newMonth += 12;
      newYear -= 1;
    }
    while (newMonth > 11) {
      newMonth -= 12;
      newYear += 1;
    }

    this.currentMonth = { year: newYear, month: newMonth };
    const key = this.getMonthKey(newYear, newMonth);
    this.ensureMonth(key);
    this.render();
  }

  /**
   * Update a recurring transaction's amount.
   */
  updateTransaction(txId, amount) {
    if (this.readonlyMode) return;
    const data = this.getCurrentMonthData();
    const tx = data.transactions.find(t => t.id === txId);
    if (tx) {
      tx.amount = Math.max(0, Number(amount) || 0);
      this.saveData();
      this.render();
    }
  }

  /**
   * Update prepayment fields: 'loanPrepay' or 'extraMF'.
   */
  updatePrepayment(field, value) {
    if (this.readonlyMode) return;
    const data = this.getCurrentMonthData();
    if (data.prepayment) {
      data.prepayment[field] = Math.max(0, Number(value) || 0);
      this.saveData();
      this.render();
    }
  }

  /**
   * Update the starting bank balance for the current month.
   */
  updateBankBalance(value) {
    if (this.readonlyMode) return;
    const data = this.getCurrentMonthData();
    data.bankBalance = Number(value) || 0;
    this.saveData();
    this.render();
  }

  /**
   * Add a one-time income or expense entry.
   */
  addOneTimeEntry(entry) {
    if (this.readonlyMode) return;
    const data = this.getCurrentMonthData();
    if (!data.oneTimeEntries) {
      data.oneTimeEntries = [];
    }
    data.oneTimeEntries.push({
      id: generateId(),
      date: entry.date,
      description: entry.description,
      type: entry.type,
      amount: Math.max(0, Number(entry.amount) || 0)
    });
    this.saveData();
    this.render();
  }

  /**
   * Remove a one-time entry by ID.
   */
  removeOneTimeEntry(entryId) {
    if (this.readonlyMode) return;
    const data = this.getCurrentMonthData();
    if (data.oneTimeEntries) {
      data.oneTimeEntries = data.oneTimeEntries.filter(e => e.id !== entryId);
      this.saveData();
      this.render();
    }
  }

  // -------------------------------------------------------------------------
  // Calculations
  // -------------------------------------------------------------------------

  /**
   * Compute the projection for the current month.
   */
  computeProjection() {
    const data = this.getCurrentMonthData();
    return this.computeProjectionForMonth(data, this.currentMonth.year, this.currentMonth.month);
  }

  /**
   * Compute projection for any month data object.
   */
  computeProjectionForMonth(data, year, month) {
    const daysInMonth = getDaysInMonth(year, month);
    const startingBalance = data.bankBalance || 0;

    // Collect all events: transactions + oneTimeEntries
    const allEvents = [];

    if (data.transactions) {
      data.transactions.forEach(tx => {
        allEvents.push({
          date: tx.date,
          day: new Date(tx.date + 'T00:00:00').getDate(),
          description: tx.description,
          type: tx.type,
          amount: tx.amount,
          category: tx.category
        });
      });
    }

    if (data.oneTimeEntries) {
      data.oneTimeEntries.forEach(ot => {
        allEvents.push({
          date: ot.date,
          day: new Date(ot.date + 'T00:00:00').getDate(),
          description: ot.description,
          type: ot.type === 'income' ? 'inflow' : 'outflow',
          amount: ot.amount,
          category: 'One-Time'
        });
      });
    }

    // Prepayment deductions: apply on the last day
    const prepay = data.prepayment || { loanPrepay: 0, extraMF: 0 };
    const totalPrepay = (prepay.loanPrepay || 0) + (prepay.extraMF || 0);
    if (totalPrepay > 0) {
      allEvents.push({
        date: year + '-' + String(month + 1).padStart(2, '0') + '-' + String(daysInMonth).padStart(2, '0'),
        day: daysInMonth,
        description: 'Prepayments',
        type: 'outflow',
        amount: totalPrepay,
        category: 'Prepayment'
      });
    }

    // Build daily balances
    let runningBalance = startingBalance;
    const dailyBalances = [];
    let totalInflow = 0;
    let totalOutflow = 0;
    let lowestBalance = startingBalance;

    for (let day = 1; day <= daysInMonth; day++) {
      let dayInflow = 0;
      let dayOutflow = 0;

      allEvents.forEach(ev => {
        if (ev.day === day) {
          if (ev.type === 'inflow') {
            dayInflow += ev.amount;
          } else {
            dayOutflow += ev.amount;
          }
        }
      });

      runningBalance = runningBalance + dayInflow - dayOutflow;
      totalInflow += dayInflow;
      totalOutflow += dayOutflow;

      if (runningBalance < lowestBalance) {
        lowestBalance = runningBalance;
      }

      const dateStr =
        year + '-' +
        String(month + 1).padStart(2, '0') + '-' +
        String(day).padStart(2, '0');

      dailyBalances.push({
        day: day,
        date: dateStr,
        balance: runningBalance,
        inflow: dayInflow,
        outflow: dayOutflow,
        netFlow: dayInflow - dayOutflow
      });
    }

    const excess = lowestBalance - (this.state ? this.state.settings.safetyBuffer : DEFAULT_SETTINGS.safetyBuffer);

    return {
      dailyBalances,
      totalInflow,
      totalOutflow,
      lowestBalance,
      excess,
      startingBalance
    };
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  /**
   * Master render: calls all sub-render methods.
   */
  render() {
    const projection = this.computeProjection();
    this.renderHeader();
    this.renderSummaryCards(projection);
    this.renderChart(projection);
    this.renderCreditCards();
    this.renderFixedPayments();
    this.renderPrepaymentPlanner(projection);
    this.renderTimeline();
    this.renderOneTimeSection();
    this.renderSpreadsheetLog();
    this.renderBankBalanceInput();
  }

  /**
   * Render the header: month/year display and navigation buttons.
   */
  renderHeader() {
    const monthLabel = document.getElementById('currentMonthLabel');
    if (monthLabel) {
      monthLabel.textContent = MONTH_NAMES[this.currentMonth.month] + ' ' + this.currentMonth.year;
    }

    // Navigation buttons are always enabled (unlimited navigation)
    const prevBtn = document.getElementById('prevMonthBtn');
    const nextBtn = document.getElementById('nextMonthBtn');
    if (prevBtn) prevBtn.disabled = false;
    if (nextBtn) nextBtn.disabled = false;
  }

  /**
   * Render and animate the 4 summary cards.
   */
  renderSummaryCards(projection) {
    const cards = [
      { id: 'totalInflow', value: projection.totalInflow, key: 'inflow' },
      { id: 'totalOutflow', value: projection.totalOutflow, key: 'outflow' },
      { id: 'lowestBalance', value: projection.lowestBalance, key: 'lowest' },
      { id: 'excessAmount', value: projection.excess, key: 'excess' }
    ];

    cards.forEach(card => {
      const el = document.getElementById(card.id);
      if (el) {
        const prevVal = this.previousCardValues[card.key] || 0;
        animateValue(el, prevVal, card.value, 600);
        this.previousCardValues[card.key] = card.value;

        // Color excess/lowest based on sign
        if (card.key === 'excess' || card.key === 'lowest') {
          const parentCard = el.closest('.summary-card');
          if (parentCard) {
            parentCard.classList.toggle('negative', card.value < 0);
          }
        }
      }
    });
  }

  /**
   * Render the bank balance input field.
   */
  renderBankBalanceInput() {
    const input = document.getElementById('bankBalanceInput');
    if (input) {
      const data = this.getCurrentMonthData();
      if (document.activeElement !== input) {
        input.value = data.bankBalance || 0;
      }
      if (this.readonlyMode) {
        input.disabled = true;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Chart Drawing (Canvas)
  // -------------------------------------------------------------------------

  /**
   * Draw the balance projection chart on canvas#balanceChart.
   */
  renderChart(projection) {
    const canvas = document.getElementById('balanceChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    // Set display size via CSS
    const rect = canvas.parentElement.getBoundingClientRect();
    const displayWidth = rect.width || 700;
    const displayHeight = rect.height || 300;

    canvas.style.width = displayWidth + 'px';
    canvas.style.height = displayHeight + 'px';
    canvas.width = Math.floor(displayWidth * dpr);
    canvas.height = Math.floor(displayHeight * dpr);
    ctx.scale(dpr, dpr);

    // Padding
    const padLeft = 65;
    const padTop = 20;
    const padRight = 20;
    const padBottom = 35;
    const chartW = displayWidth - padLeft - padRight;
    const chartH = displayHeight - padTop - padBottom;

    // Clear
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    const balances = projection.dailyBalances;
    if (!balances || balances.length === 0) return;

    // Determine Y range
    const allValues = balances.map(b => b.balance);
    const safetyBuffer = this.state ? this.state.settings.safetyBuffer : DEFAULT_SETTINGS.safetyBuffer;
    allValues.push(safetyBuffer);
    allValues.push(projection.startingBalance);

    let yMin = Math.min(...allValues);
    let yMax = Math.max(...allValues);

    // Add padding
    const yRange = yMax - yMin || 1;
    yMin = yMin - yRange * 0.1;
    yMax = yMax + yRange * 0.1;

    // Helper functions
    const xForDay = (day) => padLeft + ((day - 1) / (balances.length - 1 || 1)) * chartW;
    const yForVal = (val) => padTop + chartH - ((val - yMin) / (yMax - yMin)) * chartH;

    // --- Grid lines (horizontal, dashed, subtle) ---
    const gridSteps = 5;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= gridSteps; i++) {
      const val = yMin + (yMax - yMin) * (i / gridSteps);
      const y = yForVal(val);
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + chartW, y);
      ctx.stroke();
    }
    ctx.restore();

    // --- Y-axis labels ---
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '11px "Inter", system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= gridSteps; i++) {
      const val = yMin + (yMax - yMin) * (i / gridSteps);
      const y = yForVal(val);
      ctx.fillText(formatCompact(val), padLeft - 8, y);
    }

    // --- X-axis labels ---
    const xLabels = [1, 5, 10, 15, 20, 25, Math.min(30, balances.length)];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    xLabels.forEach(day => {
      if (day <= balances.length) {
        const x = xForDay(day);
        ctx.fillText(String(day), x, padTop + chartH + 8);
      }
    });

    // --- Safety buffer line ---
    const bufferY = yForVal(safetyBuffer);
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--excess').trim() || '#f7c948';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(padLeft, bufferY);
    ctx.lineTo(padLeft + chartW, bufferY);
    ctx.stroke();
    ctx.restore();

    // Safety buffer label
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--excess').trim() || '#f7c948';
    ctx.font = '10px "Inter", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Safety Buffer ' + formatCompact(safetyBuffer), padLeft + 4, bufferY - 4);

    // --- Red zone: where balance dips below safety buffer ---
    const warningColor = getComputedStyle(document.documentElement).getPropertyValue('--warning').trim() || '#ef4444';
    ctx.save();
    ctx.beginPath();
    let inRedZone = false;
    for (let i = 0; i < balances.length; i++) {
      const x = xForDay(balances[i].day);
      const bal = balances[i].balance;

      if (bal < safetyBuffer) {
        if (!inRedZone) {
          // Start red zone from the buffer line
          const prevBal = i > 0 ? balances[i - 1].balance : projection.startingBalance;
          const prevX = i > 0 ? xForDay(balances[i - 1].day) : padLeft;
          if (prevBal >= safetyBuffer) {
            // Interpolate crossing point
            const ratio = (safetyBuffer - prevBal) / (bal - prevBal);
            const crossX = prevX + (x - prevX) * ratio;
            ctx.moveTo(crossX, bufferY);
            ctx.lineTo(x, yForVal(bal));
          } else {
            ctx.moveTo(x, yForVal(bal));
          }
          inRedZone = true;
        } else {
          ctx.lineTo(x, yForVal(bal));
        }
      } else {
        if (inRedZone) {
          // Close off red zone
          const prevBal = balances[i - 1].balance;
          const prevX = xForDay(balances[i - 1].day);
          const ratio = (safetyBuffer - prevBal) / (bal - prevBal);
          const crossX = prevX + (x - prevX) * ratio;
          ctx.lineTo(crossX, bufferY);
          ctx.closePath();
          inRedZone = false;
        }
      }
    }
    if (inRedZone) {
      // End of the month still in red zone
      ctx.lineTo(xForDay(balances[balances.length - 1].day), bufferY);
      ctx.closePath();
    }
    ctx.fillStyle = warningColor.replace(')', ',0.08)').replace('rgb(', 'rgba(');
    if (!ctx.fillStyle.includes('rgba')) {
      ctx.fillStyle = 'rgba(239,68,68,0.08)';
    }
    ctx.fill();
    ctx.restore();

    // --- Balance line gradient ---
    const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6c63ff';
    const incomeColor = getComputedStyle(document.documentElement).getPropertyValue('--income').trim() || '#4ade80';

    const lineGrad = ctx.createLinearGradient(padLeft, 0, padLeft + chartW, 0);
    lineGrad.addColorStop(0, accentColor);
    lineGrad.addColorStop(1, incomeColor);

    // Draw the line
    ctx.beginPath();
    for (let i = 0; i < balances.length; i++) {
      const x = xForDay(balances[i].day);
      const y = yForVal(balances[i].balance);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // --- Fill area below the line ---
    const fillGrad = ctx.createLinearGradient(0, padTop, 0, padTop + chartH);
    fillGrad.addColorStop(0, accentColor.includes('#')
      ? accentColor + '26'
      : accentColor.replace(')', ',0.15)').replace('rgb(', 'rgba('));
    fillGrad.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.beginPath();
    for (let i = 0; i < balances.length; i++) {
      const x = xForDay(balances[i].day);
      const y = yForVal(balances[i].balance);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.lineTo(xForDay(balances[balances.length - 1].day), padTop + chartH);
    ctx.lineTo(xForDay(balances[0].day), padTop + chartH);
    ctx.closePath();
    ctx.fillStyle = fillGrad;
    ctx.fill();

    // --- Dots at transaction dates ---
    const transactionDays = new Set();
    const data = this.getCurrentMonthData();
    if (data.transactions) {
      data.transactions.forEach(tx => {
        if (tx.amount > 0) {
          transactionDays.add(new Date(tx.date + 'T00:00:00').getDate());
        }
      });
    }
    if (data.oneTimeEntries) {
      data.oneTimeEntries.forEach(ot => {
        if (ot.amount > 0) {
          transactionDays.add(new Date(ot.date + 'T00:00:00').getDate());
        }
      });
    }

    transactionDays.forEach(day => {
      const entry = balances.find(b => b.day === day);
      if (entry) {
        const x = xForDay(day);
        const y = yForVal(entry.balance);
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = accentColor;
        ctx.fill();
        ctx.strokeStyle = '#0d0d14';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });

    // Store chart geometry for tooltip handling
    this._chartGeometry = {
      padLeft, padTop, padRight, padBottom,
      chartW, chartH,
      displayWidth, displayHeight,
      yMin, yMax,
      balances,
      xForDay, yForVal
    };
  }

  // -------------------------------------------------------------------------
  // Credit Cards Section
  // -------------------------------------------------------------------------

  /**
   * Check if the bill generation date has passed for a credit card transaction.
   */
  isBillGenerated(tx, year, month) {
    if (!tx.billGenDay) return false;
    let billYear, billMonth;
    if (tx.billGenMonth === 'prev') {
      billMonth = month === 0 ? 11 : month - 1;
      billYear = month === 0 ? year - 1 : year;
    } else {
      billMonth = month;
      billYear = year;
    }
    const billDateStr = billYear + '-' + String(billMonth + 1).padStart(2, '0') + '-' + String(tx.billGenDay).padStart(2, '0');
    return isPast(billDateStr) || isToday(billDateStr);
  }

  /**
   * Mark a credit card as paid early (manual payment before auto-pay).
   */
  markAsPaidEarly(txId) {
    if (this.readonlyMode) return;
    const data = this.getCurrentMonthData();
    const tx = data.transactions.find(t => t.id === txId);
    if (tx) {
      tx.paidEarly = true;
      tx.paidEarlyDate = new Date().toISOString().split('T')[0];
      this.saveData();
      this.render();
      showToast(tx.description.split(' (')[0] + ' marked as paid early!');
    }
  }

  /**
   * Undo a paid early marking.
   */
  undoPaidEarly(txId) {
    if (this.readonlyMode) return;
    const data = this.getCurrentMonthData();
    const tx = data.transactions.find(t => t.id === txId);
    if (tx) {
      tx.paidEarly = false;
      delete tx.paidEarlyDate;
      this.saveData();
      this.render();
    }
  }

  /**
   * Render the 5 credit card items with editable inputs and status badges.
   */
  renderCreditCards() {
    const container = document.getElementById('creditCardList');
    if (!container) return;

    const data = this.getCurrentMonthData();
    const creditCards = ['idfc', 'sbi_sriram', 'icici', 'sbi_lava', 'hdfc'];

    const cardNames = {
      idfc: 'IDFC',
      sbi_sriram: 'SBI Sriram',
      icici: 'ICICI',
      sbi_lava: 'SBI Lava',
      hdfc: 'HDFC'
    };

    container.innerHTML = '';

    creditCards.forEach(cardId => {
      const tx = data.transactions.find(t => t.id === cardId);
      if (!tx) return;

      // Determine status
      let status = '';
      let statusClass = '';
      const dateIsPast = isPast(tx.date);

      if (dateIsPast || tx.paidEarly) {
        status = tx.paidEarly ? '✓ Paid Early' : '✓ Paid';
        statusClass = 'status-paid';
      } else if (tx.amount > 0) {
        status = '✎ Bill Entered';
        statusClass = 'status-entered';
      } else {
        // Check if bill generation date has passed
        const billGenPassed = this.isBillGenerated(tx, this.currentMonth.year, this.currentMonth.month);
        if (billGenPassed) {
          status = '⚠ Enter Bill';
          statusClass = 'status-enter-bill';
        } else {
          status = '◷ Bill Not Generated';
          statusClass = 'status-awaiting';
        }
      }

      const item = document.createElement('div');
      item.className = 'credit-card-item';
      item.innerHTML =
        '<div class="cc-info">' +
          '<div class="cc-name">' + cardNames[cardId] + '</div>' +
          '<div class="cc-description">' + tx.description + '</div>' +
          '<div class="cc-date">' + formatDate(tx.date) + '</div>' +
        '</div>' +
        '<div class="cc-controls">' +
          '<span class="cc-status ' + statusClass + '">' + status + '</span>' +
          '<div class="cc-input-wrap">' +
            '<span class="rupee-symbol">₹</span>' +
            '<input type="number" class="cc-amount-input" data-tx-id="' + cardId + '" value="' + tx.amount + '" min="0" step="100" ' + (this.readonlyMode ? 'disabled' : '') + '>' +
          '</div>' +
          (tx.amount > 0 && !dateIsPast && !tx.paidEarly
            ? '<button class="btn-mark-paid" data-mark-paid-id="' + cardId + '" title="Mark as paid early">✓ Paid</button>'
            : '') +
          (tx.paidEarly && !dateIsPast
            ? '<button class="btn-undo-paid" data-undo-paid-id="' + cardId + '" title="Undo paid early">↩ Undo</button>'
            : '') +
        '</div>';

      container.appendChild(item);
    });
  }

  // -------------------------------------------------------------------------
  // Fixed Payments Section
  // -------------------------------------------------------------------------

  /**
   * Render House EMI, SIPs, Dad Allowance, Lavanya Contribution.
   */
  renderFixedPayments() {
    const container = document.getElementById('fixedPaymentsList');
    if (!container) return;

    const data = this.getCurrentMonthData();
    const fixedIds = ['emi', 'sips', 'rd', 'dad', 'lavanya', 'salary'];

    const labels = {
      emi: 'House EMI',
      sips: 'SIPs',
      rd: 'Recurring Deposit',
      dad: 'Dad Allowance',
      lavanya: 'Lavanya Contribution',
      salary: 'Salary'
    };

    const icons = {
      emi: '🏠',
      sips: '📈',
      rd: '🏦',
      dad: '👨‍👧',
      lavanya: '💰',
      salary: '💼'
    };

    container.innerHTML = '';

    fixedIds.forEach(fixedId => {
      const tx = data.transactions.find(t => t.id === fixedId);
      if (!tx) return;

      const item = document.createElement('div');
      item.className = 'fixed-payment-item';
      item.innerHTML =
        '<div class="fp-info">' +
          '<span class="fp-icon">' + icons[fixedId] + '</span>' +
          '<div>' +
            '<div class="fp-name">' + labels[fixedId] + '</div>' +
            '<div class="fp-date">' + formatDate(tx.date) + ' · ' + tx.category + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="fp-input-wrap">' +
          '<span class="rupee-symbol">₹</span>' +
          '<input type="number" class="fp-amount-input" data-tx-id="' + fixedId + '" value="' + tx.amount + '" min="0" step="1000" ' + (this.readonlyMode ? 'disabled' : '') + '>' +
          '<span class="fp-type-badge ' + tx.type + '">' + (tx.type === 'inflow' ? '↑ In' : '↓ Out') + '</span>' +
        '</div>';

      container.appendChild(item);
    });
  }

  // -------------------------------------------------------------------------
  // Prepayment Planner
  // -------------------------------------------------------------------------

  /**
   * Render the prepayment planner section.
   */
  renderPrepaymentPlanner(projection) {
    const data = this.getCurrentMonthData();
    const prepay = data.prepayment || { loanPrepay: 0, extraMF: 0 };
    const safetyBuffer = this.state ? this.state.settings.safetyBuffer : DEFAULT_SETTINGS.safetyBuffer;

    // Excess is computed WITHOUT prepayments factored in, so recalculate
    // Recompute projection without prepayments
    const excessBeforePrepay = projection.lowestBalance - safetyBuffer + (prepay.loanPrepay || 0) + (prepay.extraMF || 0);

    const remaining = excessBeforePrepay - (prepay.loanPrepay || 0) - (prepay.extraMF || 0);

    const excessEl = document.getElementById('surplusExcess');
    if (excessEl) {
      excessEl.textContent = formatCurrency(excessBeforePrepay);
      excessEl.classList.toggle('negative', excessBeforePrepay < 0);
    }

    const remainingEl = document.getElementById('prepayRemaining');
    if (remainingEl) {
      remainingEl.textContent = formatCurrency(remaining);
      remainingEl.classList.toggle('warning', remaining < 0);
    }

    const loanInput = document.getElementById('loanPrepayInput');
    if (loanInput && document.activeElement !== loanInput) {
      loanInput.value = prepay.loanPrepay || 0;
      if (this.readonlyMode) loanInput.disabled = true;
    }

    const mfInput = document.getElementById('extraMFInput');
    if (mfInput && document.activeElement !== mfInput) {
      mfInput.value = prepay.extraMF || 0;
      if (this.readonlyMode) mfInput.disabled = true;
    }

    const safetyInput = document.getElementById('safetyBufferInput');
    if (safetyInput && document.activeElement !== safetyInput) {
      safetyInput.value = safetyBuffer;
      if (this.readonlyMode) safetyInput.disabled = true;
    }

    // Prepayment timing recommendation
    const timingEl = document.getElementById('prepayTiming');
    if (timingEl) {
      const data2 = this.getCurrentMonthData();
      // Find the dates of Dad Allowance and Lavanya Contribution
      const dadTx = data2.transactions.find(t => t.id === 'dad');
      const lavTx = data2.transactions.find(t => t.id === 'lavanya');

      // Find all remaining outflow dates after potential prepayment
      const allTx = [...(data2.transactions || []), ...(data2.oneTimeEntries || []).map(ot => ({...ot, type: ot.type === 'income' ? 'inflow' : 'outflow'}))];
      allTx.sort((a, b) => a.date.localeCompare(b.date));

      // Key inflow dates to wait for
      const waitDates = [];
      if (dadTx && dadTx.amount > 0 && !isPast(dadTx.date)) {
        waitDates.push({ name: 'Dad Allowance', date: dadTx.date });
      }
      if (lavTx && lavTx.amount > 0 && !isPast(lavTx.date)) {
        waitDates.push({ name: 'Lavanya Contribution', date: lavTx.date });
      }

      // Find the latest date we need to wait for
      let earliestPrepayDate = null;
      if (waitDates.length > 0) {
        const latestWait = waitDates.reduce((a, b) => a.date > b.date ? a : b);
        earliestPrepayDate = latestWait.date;
      }

      // Check: after prepayment, will balance stay above safety buffer for all remaining outflows?
      let timingHtml = '';
      if (excessBeforePrepay <= 0) {
        timingHtml = '<div class="timing-warning"><span class="timing-icon">⚠</span> No excess available for prepayment this month</div>';
      } else if (earliestPrepayDate && !isPast(earliestPrepayDate)) {
        const waitNames = waitDates.map(w => w.name).join(' & ');
        timingHtml = '<div class="timing-recommendation">' +
          '<span class="timing-icon">📅</span>' +
          '<div class="timing-text">' +
            '<strong>Recommended: Prepay after ' + formatDate(earliestPrepayDate) + '</strong>' +
            '<span class="timing-reason">Wait for ' + waitNames + ' before deploying funds</span>' +
          '</div>' +
        '</div>';
      } else if (excessBeforePrepay > 0) {
        timingHtml = '<div class="timing-safe"><span class="timing-icon">✅</span> All expected inflows received — safe to prepay now!</div>';
      }

      timingEl.innerHTML = timingHtml;
    }
  }

  // -------------------------------------------------------------------------
  // Transaction Timeline
  // -------------------------------------------------------------------------

  /**
   * Render all transactions + oneTimeEntries sorted by date.
   */
  renderTimeline() {
    const container = document.getElementById('transactionTimeline');
    if (!container) return;

    const data = this.getCurrentMonthData();

    // Combine all entries
    const allEntries = [];

    if (data.transactions) {
      data.transactions.forEach(tx => {
        allEntries.push({
          id: tx.id,
          date: tx.date,
          description: tx.description,
          category: tx.category,
          type: tx.type,
          amount: tx.amount,
          source: 'recurring'
        });
      });
    }

    if (data.oneTimeEntries) {
      data.oneTimeEntries.forEach(ot => {
        allEntries.push({
          id: ot.id,
          date: ot.date,
          description: ot.description,
          category: 'One-Time',
          type: ot.type === 'income' ? 'inflow' : 'outflow',
          amount: ot.amount,
          source: 'onetime'
        });
      });
    }

    // Sort by date
    allEntries.sort((a, b) => a.date.localeCompare(b.date));

    container.innerHTML = '';

    if (allEntries.length === 0) {
      container.innerHTML = '<div class="empty-state">No transactions this month.</div>';
      return;
    }

    // Compute running balance for timeline
    let runningBal = data.bankBalance || 0;
    const balanceMap = {};

    // Build a map of day -> events
    const dayEventsMap = {};
    allEntries.forEach(e => {
      const day = new Date(e.date + 'T00:00:00').getDate();
      if (!dayEventsMap[day]) dayEventsMap[day] = [];
      dayEventsMap[day].push(e);
    });

    const daysInMonth = getDaysInMonth(this.currentMonth.year, this.currentMonth.month);
    for (let day = 1; day <= daysInMonth; day++) {
      if (dayEventsMap[day]) {
        dayEventsMap[day].forEach(ev => {
          if (ev.type === 'inflow') {
            runningBal += ev.amount;
          } else {
            runningBal -= ev.amount;
          }
          balanceMap[ev.id] = runningBal;
        });
      }
    }

    allEntries.forEach(entry => {
      const past = isPast(entry.date);
      const today = isToday(entry.date);

      let timeClass = 'upcoming';
      if (today) timeClass = 'today';
      else if (past) timeClass = 'past';

      const row = document.createElement('div');
      row.className = 'timeline-item ' + timeClass;

      const amountClass = entry.type === 'inflow' ? 'amount-inflow' : 'amount-outflow';
      const amountSign = entry.type === 'inflow' ? '+' : '-';
      const balanceAfter = balanceMap[entry.id] != null ? balanceMap[entry.id] : '';

      row.innerHTML =
        '<div class="tl-date">' +
          '<span class="tl-day">' + formatDate(entry.date) + '</span>' +
          (today ? '<span class="tl-today-badge">Today</span>' : '') +
        '</div>' +
        '<div class="tl-details">' +
          '<span class="tl-description">' + entry.description + '</span>' +
          '<span class="tl-category">' + entry.category + '</span>' +
        '</div>' +
        '<div class="tl-amounts">' +
          '<span class="tl-amount ' + amountClass + '">' +
            (entry.amount > 0 ? amountSign + formatCurrency(entry.amount) : '—') +
          '</span>' +
          (balanceAfter !== '' ? '<span class="tl-balance">Bal: ' + formatCurrency(balanceAfter) + '</span>' : '') +
        '</div>' +
        (entry.source === 'onetime' && !this.readonlyMode
          ? '<button class="tl-remove-btn" data-remove-id="' + entry.id + '" title="Remove">✕</button>'
          : '');

      container.appendChild(row);
    });
  }

  // -------------------------------------------------------------------------
  // One-Time Entries Section
  // -------------------------------------------------------------------------

  /**
   * Render the one-time entries add buttons and list.
   */
  renderOneTimeSection() {
    const listEl = document.getElementById('oneTimeList');
    if (!listEl) return;

    const data = this.getCurrentMonthData();
    const entries = data.oneTimeEntries || [];

    listEl.innerHTML = '';

    if (entries.length === 0) {
      listEl.innerHTML = '<div class="empty-state">No one-time entries. Click + to add.</div>';
      return;
    }

    entries.forEach(entry => {
      const isIncome = entry.type === 'income';
      const item = document.createElement('div');
      item.className = 'onetime-item';
      item.innerHTML =
        '<div class="ot-info">' +
          '<span class="ot-type-badge ' + (isIncome ? 'inflow' : 'outflow') + '">' +
            (isIncome ? '↑ Income' : '↓ Expense') +
          '</span>' +
          '<span class="ot-description">' + entry.description + '</span>' +
          '<span class="ot-date">' + formatDate(entry.date) + '</span>' +
        '</div>' +
        '<div class="ot-amount-wrap">' +
          '<span class="ot-amount ' + (isIncome ? 'amount-inflow' : 'amount-outflow') + '">' +
            (isIncome ? '+' : '-') + formatCurrency(entry.amount) +
          '</span>' +
          (!this.readonlyMode
            ? '<button class="ot-remove-btn" data-ot-remove-id="' + entry.id + '" title="Remove">✕</button>'
            : '') +
        '</div>';

      listEl.appendChild(item);
    });
  }

  /**
   * Render a spreadsheet-style log of all transactions for the month.
   */
  renderSpreadsheetLog() {
    const container = document.getElementById('spreadsheetLog');
    if (!container) return;

    const data = this.getCurrentMonthData();
    const allEntries = [];

    if (data.transactions) {
      data.transactions.forEach(tx => {
        allEntries.push({
          date: tx.date,
          description: tx.description,
          category: tx.category,
          type: tx.type,
          amount: tx.amount,
          paidEarly: tx.paidEarly || false,
          paidEarlyDate: tx.paidEarlyDate || null,
          source: 'recurring'
        });
      });
    }

    if (data.oneTimeEntries) {
      data.oneTimeEntries.forEach(ot => {
        allEntries.push({
          date: ot.date,
          description: ot.description,
          category: 'One-Time',
          type: ot.type === 'income' ? 'inflow' : 'outflow',
          amount: ot.amount,
          paidEarly: false,
          source: 'onetime'
        });
      });
    }

    // Sort by date
    allEntries.sort((a, b) => a.date.localeCompare(b.date));

    let runningBal = data.bankBalance || 0;
    let html = '<div class="log-table-wrap"><table class="log-table">';
    html += '<thead><tr>';
    html += '<th>Status</th><th>Date</th><th>Description</th><th>Category</th><th class="num">Inflow (+)</th><th class="num">Outflow (−)</th><th class="num">Balance</th>';
    html += '</tr></thead><tbody>';

    // Opening balance row
    html += '<tr class="log-opening">';
    html += '<td></td><td></td><td class="log-desc-cell">Opening Balance</td><td></td><td></td><td></td><td class="num">' + formatCurrency(runningBal) + '</td>';
    html += '</tr>';

    allEntries.forEach(entry => {
      const past = isPast(entry.date);
      const today = isToday(entry.date);
      let statusIcon = '';
      let rowClass = '';

      if (entry.paidEarly) {
        statusIcon = '<span class="log-status paid-early" title="Paid Early on ' + (entry.paidEarlyDate || 'N/A') + '">✓E</span>';
        rowClass = 'log-past';
      } else if (past) {
        statusIcon = '<span class="log-status paid" title="Completed">✓</span>';
        rowClass = 'log-past';
      } else if (today) {
        statusIcon = '<span class="log-status today" title="Today">●</span>';
        rowClass = 'log-today';
      } else {
        statusIcon = '<span class="log-status upcoming" title="Upcoming">○</span>';
        rowClass = 'log-upcoming';
      }

      const inflow = entry.type === 'inflow' ? entry.amount : 0;
      const outflow = entry.type !== 'inflow' ? entry.amount : 0;
      runningBal += inflow - outflow;

      html += '<tr class="' + rowClass + '">';
      html += '<td>' + statusIcon + '</td>';
      html += '<td class="log-date-cell">' + formatDate(entry.date) + '</td>';
      html += '<td class="log-desc-cell">' + entry.description + '</td>';
      html += '<td><span class="log-category">' + entry.category + '</span></td>';
      html += '<td class="num ' + (inflow > 0 ? 'amount-inflow' : '') + '">' + (inflow > 0 ? formatCurrency(inflow) : '—') + '</td>';
      html += '<td class="num ' + (outflow > 0 ? 'amount-outflow' : '') + '">' + (outflow > 0 ? formatCurrency(outflow) : '—') + '</td>';
      html += '<td class="num ' + (runningBal < 0 ? 'amount-outflow' : '') + '">' + formatCurrency(runningBal) + '</td>';
      html += '</tr>';
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
  }

  // -------------------------------------------------------------------------
  // Event Handlers
  // -------------------------------------------------------------------------

  /**
   * Bind all event listeners.
   */
  bindEvents() {
    const self = this;

    // --- Month navigation ---
    const prevBtn = document.getElementById('prevMonthBtn');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => self.navigateMonth(-1));
    }

    const nextBtn = document.getElementById('nextMonthBtn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => self.navigateMonth(1));
    }

    // --- Credit card inputs (delegated) ---
    const ccList = document.getElementById('creditCardList');
    if (ccList) {
      ccList.addEventListener('change', (e) => {
        if (e.target.classList.contains('cc-amount-input')) {
          const txId = e.target.getAttribute('data-tx-id');
          self.updateTransaction(txId, e.target.value);
        }
      });
      ccList.addEventListener('blur', (e) => {
        if (e.target.classList.contains('cc-amount-input')) {
          const txId = e.target.getAttribute('data-tx-id');
          self.updateTransaction(txId, e.target.value);
        }
      }, true);
      // Mark as paid early (delegated)
      ccList.addEventListener('click', (e) => {
        const markBtn = e.target.closest('.btn-mark-paid');
        if (markBtn) {
          const txId = markBtn.getAttribute('data-mark-paid-id');
          self.markAsPaidEarly(txId);
        }
        const undoBtn = e.target.closest('.btn-undo-paid');
        if (undoBtn) {
          const txId = undoBtn.getAttribute('data-undo-paid-id');
          self.undoPaidEarly(txId);
        }
      });
    }

    // --- Fixed payment inputs (delegated) ---
    const fpList = document.getElementById('fixedPaymentsList');
    if (fpList) {
      fpList.addEventListener('change', (e) => {
        if (e.target.classList.contains('fp-amount-input')) {
          const txId = e.target.getAttribute('data-tx-id');
          self.updateTransaction(txId, e.target.value);
        }
      });
      fpList.addEventListener('blur', (e) => {
        if (e.target.classList.contains('fp-amount-input')) {
          const txId = e.target.getAttribute('data-tx-id');
          self.updateTransaction(txId, e.target.value);
        }
      }, true);
    }

    // --- Bank balance input ---
    const bankInput = document.getElementById('bankBalanceInput');
    if (bankInput) {
      bankInput.addEventListener('change', (e) => {
        self.updateBankBalance(e.target.value);
      });
      bankInput.addEventListener('blur', (e) => {
        self.updateBankBalance(e.target.value);
      });
    }

    // --- Prepayment inputs ---
    const loanInput = document.getElementById('loanPrepayInput');
    if (loanInput) {
      loanInput.addEventListener('change', (e) => {
        self.updatePrepayment('loanPrepay', e.target.value);
      });
      loanInput.addEventListener('blur', (e) => {
        self.updatePrepayment('loanPrepay', e.target.value);
      });
    }

    const mfInput = document.getElementById('extraMFInput');
    if (mfInput) {
      mfInput.addEventListener('change', (e) => {
        self.updatePrepayment('extraMF', e.target.value);
      });
      mfInput.addEventListener('blur', (e) => {
        self.updatePrepayment('extraMF', e.target.value);
      });
    }

    // --- Safety buffer input ---
    const safetyInput = document.getElementById('safetyBufferInput');
    if (safetyInput) {
      safetyInput.addEventListener('change', (e) => {
        if (!self.readonlyMode && self.state) {
          self.state.settings.safetyBuffer = Math.max(0, Number(e.target.value) || 0);
          self.saveData();
          self.render();
        }
      });
      safetyInput.addEventListener('blur', (e) => {
        if (!self.readonlyMode && self.state) {
          self.state.settings.safetyBuffer = Math.max(0, Number(e.target.value) || 0);
          self.saveData();
          self.render();
        }
      });
    }

    // --- Add one-time entry buttons ---
    const addIncomeBtn = document.getElementById('addOneTimeIncome');
    if (addIncomeBtn) {
      addIncomeBtn.addEventListener('click', () => self.openOneTimeModal('income'));
    }

    const addExpenseBtn = document.getElementById('addOneTimeExpense');
    if (addExpenseBtn) {
      addExpenseBtn.addEventListener('click', () => self.openOneTimeModal('expense'));
    }

    // --- Modal save / cancel ---
    const modalSave = document.getElementById('modalSaveBtn');
    if (modalSave) {
      modalSave.addEventListener('click', () => self.saveOneTimeModal());
    }

    const modalCancel = document.getElementById('modalCancelBtn');
    if (modalCancel) {
      modalCancel.addEventListener('click', () => self.closeOneTimeModal());
    }

    // Close modal on overlay click
    const modalOverlay = document.getElementById('oneTimeModal');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
          self.closeOneTimeModal();
        }
      });
    }

    // --- Remove one-time entry (delegated from timeline) ---
    const timeline = document.getElementById('transactionTimeline');
    if (timeline) {
      timeline.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-remove-id]');
        if (btn) {
          self.removeOneTimeEntry(btn.getAttribute('data-remove-id'));
        }
      });
    }

    // --- Remove one-time entry from list (delegated) ---
    const otList = document.getElementById('oneTimeList');
    if (otList) {
      otList.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-ot-remove-id]');
        if (btn) {
          self.removeOneTimeEntry(btn.getAttribute('data-ot-remove-id'));
        }
      });
    }

    // --- Export button ---
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => self.exportData());
    }

    // --- Import button ---
    const importBtn = document.getElementById('importBtn');
    if (importBtn) {
      importBtn.addEventListener('click', () => self.triggerImport());
    }

    // Hidden file input for import
    let importFileInput = document.getElementById('importFileInput');
    if (!importFileInput) {
      importFileInput = document.createElement('input');
      importFileInput.type = 'file';
      importFileInput.id = 'importFileInput';
      importFileInput.accept = '.json';
      importFileInput.style.display = 'none';
      document.body.appendChild(importFileInput);
    }
    importFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          self.importData(ev.target.result);
        };
        reader.readAsText(file);
        e.target.value = '';
      }
    });

    // --- Share button ---
    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn) {
      shareBtn.addEventListener('click', () => self.shareReadOnly());
    }

    // --- Canvas chart tooltip ---
    const canvas = document.getElementById('balanceChart');
    if (canvas) {
      // Create tooltip div
      this.chartTooltipEl = document.createElement('div');
      this.chartTooltipEl.className = 'chart-tooltip';
      this.chartTooltipEl.style.cssText =
        'position:absolute;display:none;pointer-events:none;z-index:100;' +
        'background:var(--card-bg,#1e1e2e);color:var(--text-primary,#fff);' +
        'padding:8px 12px;border-radius:8px;font-size:0.78rem;' +
        'box-shadow:0 4px 16px rgba(0,0,0,0.4);border:1px solid var(--border,#333);' +
        'white-space:nowrap;';
      const chartParent = canvas.parentElement;
      if (chartParent) {
        chartParent.style.position = 'relative';
        chartParent.appendChild(this.chartTooltipEl);
      }

      canvas.addEventListener('mousemove', (e) => self.handleChartMouseMove(e));
      canvas.addEventListener('mouseleave', () => {
        if (self.chartTooltipEl) {
          self.chartTooltipEl.style.display = 'none';
        }
      });
    }

    // --- Keyboard shortcut: left/right arrows for month navigation ---
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') {
        self.navigateMonth(-1);
      } else if (e.key === 'ArrowRight') {
        self.navigateMonth(1);
      }
    });
  }

  /**
   * Handle chart mousemove to display a tooltip.
   */
  handleChartMouseMove(e) {
    if (!this._chartGeometry || !this.chartTooltipEl) return;

    const geo = this._chartGeometry;
    const canvas = e.target;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Check if mouse is within chart area
    if (
      mouseX < geo.padLeft || mouseX > geo.displayWidth - geo.padRight ||
      mouseY < geo.padTop || mouseY > geo.padTop + geo.chartH
    ) {
      this.chartTooltipEl.style.display = 'none';
      return;
    }

    // Find nearest day
    const balances = geo.balances;
    let nearest = null;
    let nearestDist = Infinity;

    for (let i = 0; i < balances.length; i++) {
      const x = geo.xForDay(balances[i].day);
      const dist = Math.abs(mouseX - x);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = balances[i];
      }
    }

    if (!nearest || nearestDist > 25) {
      this.chartTooltipEl.style.display = 'none';
      return;
    }

    // Show tooltip
    const x = geo.xForDay(nearest.day);
    const y = geo.yForVal(nearest.balance);

    let flowText = '';
    if (nearest.inflow > 0) flowText += '<span style="color:var(--income,#4ade80);">+' + formatCurrency(nearest.inflow) + '</span>';
    if (nearest.outflow > 0) flowText += (flowText ? ' · ' : '') + '<span style="color:var(--warning,#ef4444);">-' + formatCurrency(nearest.outflow) + '</span>';

    this.chartTooltipEl.innerHTML =
      '<div style="font-weight:600;margin-bottom:2px;">' + formatDate(nearest.date) + '</div>' +
      '<div>Balance: <strong>' + formatCurrency(nearest.balance) + '</strong></div>' +
      (flowText ? '<div style="margin-top:2px;">' + flowText + '</div>' : '');

    // Position tooltip
    let tooltipX = x + 12;
    let tooltipY = y - 10;

    // Keep tooltip on screen
    if (tooltipX + 150 > geo.displayWidth) {
      tooltipX = x - 160;
    }
    if (tooltipY < 5) {
      tooltipY = 5;
    }

    this.chartTooltipEl.style.left = tooltipX + 'px';
    this.chartTooltipEl.style.top = tooltipY + 'px';
    this.chartTooltipEl.style.display = 'block';
  }

  // -------------------------------------------------------------------------
  // One-Time Entry Modal
  // -------------------------------------------------------------------------

  /**
   * Open the one-time entry modal.
   */
  openOneTimeModal(type) {
    if (this.readonlyMode) return;

    const modal = document.getElementById('oneTimeModal');
    if (!modal) return;

    // Set default date to today or first of current month
    const year = this.currentMonth.year;
    const month = this.currentMonth.month;
    const now = new Date();
    let defaultDay = now.getDate();

    // If current month is not the real current month, default to 1st
    if (year !== now.getFullYear() || month !== now.getMonth()) {
      defaultDay = 1;
    }

    const defaultDate =
      year + '-' +
      String(month + 1).padStart(2, '0') + '-' +
      String(defaultDay).padStart(2, '0');

    const dateInput = document.getElementById('modalDate');
    const descInput = document.getElementById('modalDescription');
    const amountInput = document.getElementById('modalAmount');
    const typeLabel = document.getElementById('modalTypeLabel');

    if (dateInput) dateInput.value = defaultDate;
    if (descInput) descInput.value = '';
    if (amountInput) amountInput.value = '';
    if (typeLabel) typeLabel.textContent = type === 'income' ? '↑ Income' : '↓ Expense';

    modal.setAttribute('data-entry-type', type);
    modal.classList.add('active');

    if (descInput) descInput.focus();
  }

  /**
   * Save the one-time entry from modal inputs.
   */
  saveOneTimeModal() {
    const modal = document.getElementById('oneTimeModal');
    if (!modal) return;

    const type = modal.getAttribute('data-entry-type') || 'expense';
    const dateInput = document.getElementById('modalDate');
    const descInput = document.getElementById('modalDescription');
    const amountInput = document.getElementById('modalAmount');

    const date = dateInput ? dateInput.value : '';
    const description = descInput ? descInput.value.trim() : '';
    const amount = amountInput ? Number(amountInput.value) : 0;

    if (!date) {
      showToast('Please select a date.');
      return;
    }
    if (!description) {
      showToast('Please enter a description.');
      return;
    }
    if (!amount || amount <= 0) {
      showToast('Please enter a valid amount.');
      return;
    }

    this.addOneTimeEntry({ date, description, type, amount });
    this.closeOneTimeModal();
    showToast((type === 'income' ? 'Income' : 'Expense') + ' entry added!');
  }

  /**
   * Close the one-time entry modal.
   */
  closeOneTimeModal() {
    const modal = document.getElementById('oneTimeModal');
    if (modal) {
      modal.classList.remove('active');
    }
  }

  // -------------------------------------------------------------------------
  // Read-Only Mode
  // -------------------------------------------------------------------------

  /**
   * Show a banner at the top indicating read-only mode.
   */
  showReadOnlyBanner() {
    let banner = document.getElementById('readonlyBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'readonlyBanner';
      banner.style.cssText =
        'position:fixed;top:0;left:0;right:0;z-index:10000;' +
        'background:linear-gradient(135deg,var(--accent,#6c63ff),var(--income,#4ade80));' +
        'color:#fff;text-align:center;padding:8px 16px;font-size:0.85rem;font-weight:600;';
      banner.textContent = '📋 Read-Only View — This is a shared snapshot. Editing is disabled.';
      document.body.prepend(banner);
      document.body.style.paddingTop = '40px';
    }
  }

  /**
   * Load read-only data from a base64-encoded string.
   */
  loadReadOnly(base64Data) {
    try {
      const json = atob(base64Data);
      const parsed = JSON.parse(json);
      this.readonlyData = parsed.monthData || null;
      this.state = {
        settings: parsed.settings || { ...DEFAULT_SETTINGS },
        months: {}
      };
      if (parsed.monthKey && this.readonlyData) {
        const [y, m] = parsed.monthKey.split('-').map(Number);
        this.currentMonth = { year: y, month: m - 1 };
      }
    } catch (e) {
      console.error('Failed to decode read-only data:', e);
      this.initFreshState();
      showToast('Failed to load shared data.');
    }
  }

  // -------------------------------------------------------------------------
  // Sharing & Export
  // -------------------------------------------------------------------------

  /**
   * Export the full state as a downloadable JSON file.
   */
  exportData() {
    const json = JSON.stringify(this.state, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'cashflow_pulse_backup_' + new Date().toISOString().split('T')[0] + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Data exported successfully!');
  }

  /**
   * Trigger the hidden file input for importing data.
   */
  triggerImport() {
    if (this.readonlyMode) return;
    const input = document.getElementById('importFileInput');
    if (input) input.click();
  }

  /**
   * Import data from a JSON string.
   */
  importData(json) {
    if (this.readonlyMode) return;
    try {
      const parsed = JSON.parse(json);
      if (parsed && parsed.settings && parsed.months) {
        this.state = parsed;
        this.saveData();
        this.render();
        showToast('Data imported successfully!');
      } else {
        showToast('Invalid data format.');
      }
    } catch (e) {
      console.error('Import failed:', e);
      showToast('Import failed: invalid JSON.');
    }
  }

  /**
   * Generate a shareable read-only URL for the current month.
   * Encodes the current month's data as base64 and copies the URL to clipboard.
   */
  shareReadOnly() {
    const key = this.getMonthKey(this.currentMonth.year, this.currentMonth.month);
    const data = this.getCurrentMonthData();

    const payload = {
      monthKey: key,
      monthData: data,
      settings: this.state.settings
    };

    const json = JSON.stringify(payload);
    const base64 = btoa(json);

    const url = window.location.origin + window.location.pathname + '?mode=readonly&data=' + encodeURIComponent(base64);

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        showToast('Share link copied to clipboard!');
      }).catch(() => {
        this.fallbackCopyToClipboard(url);
      });
    } else {
      this.fallbackCopyToClipboard(url);
    }
  }

  /**
   * Fallback method to copy text to clipboard.
   */
  fallbackCopyToClipboard(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      showToast('Share link copied to clipboard!');
    } catch (e) {
      showToast('Could not copy link. Please copy manually.');
      console.error('Copy failed:', e);
    }
    document.body.removeChild(textarea);
  }
}

// ===========================================================================
// Initialization
// ===========================================================================

document.addEventListener('DOMContentLoaded', () => {
  window.app = new CashFlowApp();
});

// Make the class available globally for debugging
export { CashFlowApp };
