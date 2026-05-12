const STORAGE_KEY = "habit-tracker-v1";
const HABIT_COUNT = 10;
const MAX_DAYS = 31;

const monthHeadingFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric"
});

const monthCellFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long"
});

const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short"
});

const elements = {
  trackerHead: document.getElementById("trackerHead"),
  trackerBody: document.getElementById("trackerBody"),
  dailyChart: document.getElementById("dailyChart"),
  monthPicker: document.getElementById("monthPicker"),
  monthSummary: document.getElementById("monthSummary"),
  prevMonthButton: document.getElementById("prevMonthButton"),
  nextMonthButton: document.getElementById("nextMonthButton"),
  todayButton: document.getElementById("todayButton")
};

const ui = {
  habitProgressFills: [],
  habitProgressValues: [],
  dailyBars: [],
  dailyValues: [],
  dailyColumns: []
};

const state = loadState();

bindEvents();
ensureMonthData(state.selectedMonth);
render();

function bindEvents() {
  elements.prevMonthButton.addEventListener("click", () => shiftMonth(-1));
  elements.nextMonthButton.addEventListener("click", () => shiftMonth(1));
  elements.todayButton.addEventListener("click", () => setSelectedMonth(getCurrentMonthKey()));

  elements.monthPicker.addEventListener("change", (event) => {
    const nextMonth = sanitizeMonthKey(event.target.value);

    if (!nextMonth) {
      elements.monthPicker.value = state.selectedMonth;
      return;
    }

    setSelectedMonth(nextMonth);
  });
}

function render() {
  ensureMonthData(state.selectedMonth);
  elements.monthPicker.value = state.selectedMonth;
  renderHeader();
  renderBody();
  renderDailyChart();
  updateAllProgress();
}

function renderHeader() {
  const dayMeta = getDayMeta(state.selectedMonth);
  const fragment = document.createDocumentFragment();

  const monthRow = document.createElement("tr");
  const monthLabelCell = createHeaderCell("month-label-cell", "month");
  monthLabelCell.colSpan = 2;

  const monthTitleCell = createHeaderCell("month-title-cell", monthCellFormatter.format(getMonthDate(state.selectedMonth)));
  monthTitleCell.colSpan = MAX_DAYS;

  const progressTitleCell = createHeaderCell("progress-title-cell", "progress");
  progressTitleCell.rowSpan = 3;

  monthRow.append(monthLabelCell, monthTitleCell, progressTitleCell);
  fragment.append(monthRow);

  const weekdayRow = document.createElement("tr");
  const rowIndexTitleCell = createHeaderCell("row-index-title", "#");
  rowIndexTitleCell.rowSpan = 2;
  weekdayRow.append(rowIndexTitleCell);
  weekdayRow.append(createHeaderCell("habit-title-cell", "day"));

  dayMeta.forEach((meta) => {
    const cell = createHeaderCell("day-name-cell", meta.valid ? meta.weekday : "--");

    if (!meta.valid) {
      cell.classList.add("invalid-day-cell");
    }

    weekdayRow.append(cell);
  });

  fragment.append(weekdayRow);

  const dateRow = document.createElement("tr");
  dateRow.append(createHeaderCell("habit-title-cell", "date"));

  dayMeta.forEach((meta) => {
    const cell = createHeaderCell("date-number-cell", meta.valid ? String(meta.day) : "--");

    if (!meta.valid) {
      cell.classList.add("invalid-day-cell");
    }

    dateRow.append(cell);
  });

  fragment.append(dateRow);
  elements.trackerHead.replaceChildren(fragment);
}

function renderBody() {
  const monthRecord = getMonthRecord(state.selectedMonth);
  const dayMeta = getDayMeta(state.selectedMonth);
  const fragment = document.createDocumentFragment();

  ui.habitProgressFills = [];
  ui.habitProgressValues = [];

  monthRecord.habits.forEach((habit, habitIndex) => {
    const row = document.createElement("tr");
    const indexCell = document.createElement("td");
    indexCell.className = "row-index-cell";
    indexCell.textContent = String(habitIndex + 1);
    row.append(indexCell);

    const habitCell = document.createElement("td");
    habitCell.className = "habit-name-cell";
    const habitInput = document.createElement("input");
    habitInput.className = "habit-name-input";
    habitInput.type = "text";
    habitInput.maxLength = 40;
    habitInput.value = habit.name;
    habitInput.placeholder = "habit";
    habitInput.setAttribute("aria-label", `Habit ${habitIndex + 1} name`);
    habitInput.addEventListener("input", (event) => {
      monthRecord.habits[habitIndex].name = event.target.value;
      saveState();
    });
    habitCell.append(habitInput);
    row.append(habitCell);

    habit.checks.forEach((checked, dayIndex) => {
      const meta = dayMeta[dayIndex];
      const checkboxCell = document.createElement("td");
      checkboxCell.className = "checkbox-cell";

      if (!meta.valid) {
        checkboxCell.classList.add("invalid-day-cell");
      }

      const checkbox = document.createElement("input");
      checkbox.className = "habit-checkbox";
      checkbox.type = "checkbox";
      checkbox.checked = Boolean(checked);
      checkbox.disabled = !meta.valid;
      checkbox.setAttribute(
        "aria-label",
        `${habit.name || `Habit ${habitIndex + 1}`}, day ${dayIndex + 1}`
      );

      checkbox.addEventListener("change", (event) => {
        monthRecord.habits[habitIndex].checks[dayIndex] = event.target.checked;
        saveState();
        updateHabitProgress(habitIndex);
        updateDailyChartProgress();
      });

      checkboxCell.append(checkbox);
      row.append(checkboxCell);
    });

    const progressCell = document.createElement("td");
    progressCell.className = "progress-cell";
    const progressWrap = document.createElement("div");
    progressWrap.className = "habit-progress";
    const progressValue = document.createElement("span");
    progressValue.className = "progress-value";
    const progressTrack = document.createElement("div");
    progressTrack.className = "progress-track";
    const progressFill = document.createElement("div");
    progressFill.className = "progress-fill";

    progressTrack.append(progressFill);
    progressWrap.append(progressValue, progressTrack);
    progressCell.append(progressWrap);
    row.append(progressCell);

    ui.habitProgressValues.push(progressValue);
    ui.habitProgressFills.push(progressFill);
    fragment.append(row);
  });

  elements.trackerBody.replaceChildren(fragment);
}

function renderDailyChart() {
  const fragment = document.createDocumentFragment();
  const dayMeta = getDayMeta(state.selectedMonth);

  ui.dailyBars = [];
  ui.dailyValues = [];
  ui.dailyColumns = [];

  dayMeta.forEach((meta, dayIndex) => {
    const column = document.createElement("div");
    column.className = "day-bar-column";

    if (!meta.valid) {
      column.classList.add("is-invalid");
    }

    const stage = document.createElement("div");
    stage.className = "day-bar-stage";
    const bar = document.createElement("div");
    bar.className = "day-bar";
    bar.setAttribute("data-day", String(dayIndex + 1));
    stage.append(bar);

    const value = document.createElement("div");
    value.className = "day-bar-value";

    column.append(stage, value);
    fragment.append(column);

    ui.dailyColumns.push(column);
    ui.dailyBars.push(bar);
    ui.dailyValues.push(value);
  });

  elements.dailyChart.replaceChildren(fragment);
}

function updateAllProgress() {
  for (let habitIndex = 0; habitIndex < HABIT_COUNT; habitIndex += 1) {
    updateHabitProgress(habitIndex);
  }

  updateDailyChartProgress();
}

function updateHabitProgress(habitIndex) {
  const monthRecord = getMonthRecord(state.selectedMonth);
  const daysInMonth = getDaysInMonth(state.selectedMonth);
  const habit = monthRecord.habits[habitIndex];
  const completedDays = habit.checks.slice(0, daysInMonth).filter(Boolean).length;
  const percentage = daysInMonth ? (completedDays / daysInMonth) * 100 : 0;

  ui.habitProgressFills[habitIndex].style.width = `${percentage}%`;
  ui.habitProgressValues[habitIndex].textContent = formatPercent(percentage);
}

function updateDailyChartProgress() {
  const monthRecord = getMonthRecord(state.selectedMonth);
  const daysInMonth = getDaysInMonth(state.selectedMonth);
  let completedChecks = 0;

  for (let dayIndex = 0; dayIndex < MAX_DAYS; dayIndex += 1) {
    const valid = dayIndex < daysInMonth;
    const column = ui.dailyColumns[dayIndex];
    const bar = ui.dailyBars[dayIndex];
    const value = ui.dailyValues[dayIndex];

    column.classList.toggle("is-invalid", !valid);

    if (!valid) {
      bar.style.height = "0";
      value.textContent = "--";
      continue;
    }

    const completedHabits = monthRecord.habits.reduce((count, habit) => {
      return count + (habit.checks[dayIndex] ? 1 : 0);
    }, 0);

    const percentage = (completedHabits / HABIT_COUNT) * 100;
    completedChecks += completedHabits;
    bar.style.height = `${percentage}%`;
    value.textContent = formatPercent(percentage);
  }

  const totalPossibleChecks = daysInMonth * HABIT_COUNT;
  const overallPercentage = totalPossibleChecks ? (completedChecks / totalPossibleChecks) * 100 : 0;
  elements.monthSummary.textContent = `${monthHeadingFormatter.format(getMonthDate(state.selectedMonth))} | ${formatPercent(overallPercentage)} complete`;
}

function setSelectedMonth(monthKey) {
  const sanitized = sanitizeMonthKey(monthKey);

  if (!sanitized || sanitized === state.selectedMonth) {
    return;
  }

  state.selectedMonth = sanitized;
  ensureMonthData(state.selectedMonth);
  saveState();
  render();
}

function shiftMonth(step) {
  const currentMonthDate = getMonthDate(state.selectedMonth);
  currentMonthDate.setMonth(currentMonthDate.getMonth() + step);
  setSelectedMonth(toMonthKey(currentMonthDate));
}

function loadState() {
  const fallback = {
    selectedMonth: getCurrentMonthKey(),
    months: {}
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return fallback;
    }

    return normalizeStore(JSON.parse(raw));
  } catch (error) {
    console.warn("Unable to load saved tracker data.", error);
    return fallback;
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Unable to save tracker data.", error);
  }
}

function normalizeStore(rawStore) {
  const normalized = {
    selectedMonth: sanitizeMonthKey(rawStore?.selectedMonth) || getCurrentMonthKey(),
    months: {}
  };

  if (rawStore && typeof rawStore.months === "object" && rawStore.months !== null) {
    Object.entries(rawStore.months).forEach(([monthKey, record]) => {
      const sanitizedMonth = sanitizeMonthKey(monthKey);

      if (sanitizedMonth) {
        normalized.months[sanitizedMonth] = normalizeMonthRecord(record);
      }
    });
  }

  return normalized;
}

function normalizeMonthRecord(record) {
  const habits = Array.isArray(record?.habits) ? record.habits : [];

  return {
    habits: Array.from({ length: HABIT_COUNT }, (_, index) => {
      const existingHabit = habits[index];
      const checks = Array.isArray(existingHabit?.checks) ? existingHabit.checks : [];

      return {
        name: typeof existingHabit?.name === "string" ? existingHabit.name : `habit ${index + 1}`,
        checks: Array.from({ length: MAX_DAYS }, (_, dayIndex) => Boolean(checks[dayIndex]))
      };
    })
  };
}

function ensureMonthData(monthKey) {
  if (!state.months[monthKey]) {
    state.months[monthKey] = normalizeMonthRecord();
    saveState();
  }
}

function getMonthRecord(monthKey) {
  ensureMonthData(monthKey);
  return state.months[monthKey];
}

function getDayMeta(monthKey) {
  const daysInMonth = getDaysInMonth(monthKey);
  const startDate = getMonthDate(monthKey);

  return Array.from({ length: MAX_DAYS }, (_, index) => {
    const dayNumber = index + 1;
    const valid = dayNumber <= daysInMonth;

    if (!valid) {
      return {
        day: dayNumber,
        valid: false,
        weekday: ""
      };
    }

    const date = new Date(startDate.getFullYear(), startDate.getMonth(), dayNumber);

    return {
      day: dayNumber,
      valid: true,
      weekday: weekdayFormatter.format(date)
    };
  });
}

function getDaysInMonth(monthKey) {
  const monthDate = getMonthDate(monthKey);
  return new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
}

function getMonthDate(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function createHeaderCell(className, text) {
  const cell = document.createElement("th");
  cell.className = className;
  cell.textContent = text;
  return cell;
}

function sanitizeMonthKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month] = value.split("-").map(Number);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

function getCurrentMonthKey() {
  return toMonthKey(new Date());
}

function toMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatPercent(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}
