const state = {
  catalog: null,
  sheet: null,
  filter: "all",
  entries: [],
  brigades: [],
  nextId: 1,
  pendingUnit: null,
  pendingPdfDoc: null,
  pendingPdfFilename: null,
  pendingPdfUrl: null,
  activeBrigadeId: 1,
  autoAssignToBrigade: true,
};

function $(id) { return document.getElementById(id); }

function showError(msg) {
  const box = $("error-box");
  if (!msg) { box.classList.add("hidden"); box.textContent = ""; return; }
  box.textContent = msg;
  box.classList.remove("hidden");
}

function fmtWeapon(u) {
  if (u.type === "cavalry") return u.weapon;
  if (u.rangeInches) return u.weapon + " (" + u.rangeInches + '")';
  return u.weapon;
}

function fmtStats(u) {
  const fire = u.fire == null ? "-" : u.fire;
  return "F" + fire + " M" + u.melee + " T" + u.tenacity;
}

function isDetachment(profile) {
  return profile.name.toLowerCase().includes("detachment");
}

function figureBounds(profile, understrength) {
  let min = profile.figuresMin;
  let max = profile.figuresMax;
  if (understrength && !isDetachment(profile)) {
    min = Math.max(profile.type === "cavalry" ? 3 : 1, Math.ceil(min / 2));
    max = Math.max(min, Math.floor(max / 2));
  }
  return { min, max };
}

function getEliteCosts() {
  const o = (state.sheet && state.sheet.eliteOptions) || {};
  return {
    fire: o.fire != null ? o.fire : 2,
    melee: o.melee != null ? o.melee : 2,
    tenacity: o.tenacity != null ? o.tenacity : 3,
    artilleryFire: o.artilleryFire != null ? o.artilleryFire : (o.fire != null ? o.fire : 6),
  };
}

function eliteFireCost(profile) {
  const c = getEliteCosts();
  return profile.type === "artillery" ? c.artilleryFire : c.fire;
}

function getUnenthusiasticOption() {
  return (state.sheet && state.sheet.unitOptions && state.sheet.unitOptions.unenthusiastic) || null;
}

function canUseUnenthusiastic(profile) {
  const opt = getUnenthusiasticOption();
  if (!opt) return false;
  const excluded = opt.excludeSpecialRules || [];
  return !profile.specialRules.some((r) => excluded.includes(r));
}

function calcCost(profile, opts) {
  const elite = getEliteCosts();
  let cost = profile.points;
  if (opts.understrength && !isDetachment(profile)) cost -= 5;
  if (opts.unenthusiastic && canUseUnenthusiastic(profile)) {
    cost -= getUnenthusiasticOption().pointsDiscount || 6;
  }
  if (opts.eliteFire) cost += eliteFireCost(profile);
  if (opts.eliteMelee) cost += elite.melee;
  if (opts.eliteTenacity) cost += elite.tenacity;
  return cost;
}

function calcStats(profile, opts) {
  let fire = profile.fire;
  let melee = profile.melee;
  let ten = profile.tenacity;
  if (opts.understrength && !isDetachment(profile) && !profile.specialRules.includes("Militia")) {
    melee = Math.max(1, melee - 1);
    ten = Math.max(1, ten - 1);
  }
  if (opts.unenthusiastic && canUseUnenthusiastic(profile)) {
    const u = getUnenthusiasticOption();
    melee = Math.max(1, melee + (u.meleeModifier || -1));
    ten = Math.max(1, ten + (u.tenacityModifier || -1));
  }
  if (opts.eliteFire && fire != null) fire += 1;
  if (opts.eliteMelee) melee += 1;
  if (opts.eliteTenacity) ten += 1;
  return { fire, melee, tenacity: ten };
}


function getArmyName() {
  return $("army-name").value.trim();
}

function getArmyLeader() {
  return $("army-leader").value.trim();
}

function updateArmyNameDisplay() {
  if (!state.sheet) return;
  const name = getArmyName();
  const label = $("summary-army-name");
  if (label) label.textContent = name || "(unnamed)";
  const sheetLabel = state.sheet.name + " (" + state.sheet.era + ")";
  $("summary-sheet").textContent = sheetLabel;
  const leader = $("summary-army-leader");
  if (leader) leader.textContent = "Leader: " + (getArmyLeader() || "(unnamed)");
}

function entryLabel(entry) {
  return entry.customName || entry.profileName;
}

function totalPoints() {
  return state.entries.reduce((s, e) => s + e.cost, 0);
}

async function loadCatalog() {
  const res = await fetch("/api/catalog");
  if (!res.ok) throw new Error("Could not load catalog.");
  state.catalog = await res.json();
  const eraSel = $("era-select");
  eraSel.innerHTML = "";
  for (const era of state.catalog.eras) {
    const opt = document.createElement("option");
    opt.value = era.id;
    opt.textContent = era.name;
    eraSel.appendChild(opt);
  }
  eraSel.addEventListener("change", populateArmies);
  populateArmies();
}

function populateArmies() {
  const eraId = $("era-select").value;
  const era = state.catalog.eras.find((e) => e.id === eraId);
  const armySel = $("army-select");
  armySel.innerHTML = "";
  for (const army of era.armies) {
    const opt = document.createElement("option");
    opt.value = army.id;
    opt.textContent = army.name;
    armySel.appendChild(opt);
  }
  updateSheetInfo();
  armySel.onchange = updateSheetInfo;
}

async function updateSheetInfo() {
  const armyId = $("army-select").value;
  const res = await fetch("/api/army/" + armyId);
  if (!res.ok) return;
  const sheet = await res.json();
  $("sheet-info").textContent =
    sheet.name + " " + sheet.period + " - sheet " + sheet.sheetVersion +
    " (" + sheet.units.length + " unit types)";
  $("points-limit").value = sheet.defaultPointsLimit;
}

async function startBuilder() {
  const armyId = $("army-select").value;
  const res = await fetch("/api/army/" + armyId);
  if (!res.ok) { showError("Could not load army sheet."); return; }
  state.sheet = await res.json();
  ensureFateCards(state.sheet);
  state.entries = [];
  state.brigades = [{ id: 1, name: "1st Brigade", leader: "Brigadier", unitIds: [] }];
  state.activeBrigadeId = 1;
  state.autoAssignToBrigade = true;
  state.nextId = 1;
  showError("");
  $("screen-setup").classList.add("hidden");
  $("screen-builder").classList.remove("hidden");
  updateArmyNameDisplay();
  $("points-max").textContent = $("points-limit").value;
  renderAll();
}

function filteredUnits() {
  if (state.filter === "all") return state.sheet.units;
  return state.sheet.units.filter((u) => u.type === state.filter);
}

function renderCatalog() {
  const list = $("catalog-list");
  list.innerHTML = "";
  const header = document.createElement("div");
  header.className = "catalog-header";
  header.innerHTML = "<span>Unit</span><span>Action</span>";
  list.appendChild(header);
  for (const u of filteredUnits()) {
    const div = document.createElement("div");
    div.className = "catalog-item";
    div.innerHTML =
      '<div><h4>' + esc(u.name) + '</h4>' +
      '<div class="meta">' + u.type + ' | ' + u.figuresMin + '-' + u.figuresMax +
      ' figs | ' + fmtWeapon(u) + ' | ' + fmtStats(u) + ' | ' + u.points + ' pts</div>' +
      '<div class="meta">' + esc(u.specialRules.join(", ")) + '</div></div>';
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "primary";
    btn.textContent = "Add";
    btn.onclick = () => openAddDialog(u);
    div.appendChild(btn);
    list.appendChild(div);
  }
}


function getActiveBrigade() {
  return state.brigades.find((b) => b.id === state.activeBrigadeId) || state.brigades[0] || null;
}

function setActiveBrigade(brigadeId) {
  state.activeBrigadeId = brigadeId;
  updateActiveBrigadeLabel();
  renderBrigades();
}

function updateActiveBrigadeLabel() {
}

function autoAssignEntry(entryId) {
  const active = getActiveBrigade();
  if (!active) {
    showError("No active brigade. Click Make Active on a brigade.");
    return;
  }
  if (active.unitIds.length >= 8) {
    showError("Active brigade is full (8 units max).");
    return;
  }
  for (const other of state.brigades) {
    other.unitIds = other.unitIds.filter((uid) => uid !== entryId);
  }
  if (!active.unitIds.includes(entryId)) active.unitIds.push(entryId);
}

function assignUnitToBrigade(brigade, entryId) {
  if (!entryId) return;
  const id = parseInt(entryId, 10);
  for (const other of state.brigades) {
    other.unitIds = other.unitIds.filter((uid) => uid !== id);
  }
  if (!brigade.unitIds.includes(id)) brigade.unitIds.push(id);
  renderBrigades();
}

function removeUnitFromBrigade(brigade, entryId) {
  brigade.unitIds = brigade.unitIds.filter((uid) => uid !== entryId);
  renderBrigades();
}

function deleteBrigade(brigadeId) {
  if (state.brigades.length <= 1) {
    showError("You must keep at least one brigade.");
    return;
  }
  const brigade = state.brigades.find((b) => b.id === brigadeId);
  if (!brigade) return;
  const unitCount = brigade.unitIds.length;
  const msg = unitCount > 0
    ? "Delete " + brigade.name + " and its " + unitCount + " assigned unit(s)?"
    : "Delete " + brigade.name + "?";
  if (!confirm(msg)) return;
  const unitIds = new Set(brigade.unitIds);
  state.brigades = state.brigades.filter((b) => b.id !== brigadeId);
  if (state.activeBrigadeId === brigadeId) {
    state.activeBrigadeId = state.brigades[0].id;
  }
  state.entries = state.entries.filter((e) => !unitIds.has(e.id));
  for (const b of state.brigades) {
    b.unitIds = b.unitIds.filter((uid) => !unitIds.has(uid));
  }
  showError("");
  renderAll();
}

function renderBrigades() {
  const list = $("brigade-list");
  const scrollTop = list.scrollTop;
  list.innerHTML = "";
  for (const b of state.brigades) {
    const card = document.createElement("div");
    card.className = "brigade-card" + (b.id === state.activeBrigadeId ? " brigade-active" : "");
    const cardHeader = document.createElement("div");
    cardHeader.className = "brigade-card-header";
    cardHeader.textContent = b.name;
    card.appendChild(cardHeader);
    const body = document.createElement("div");
    body.className = "brigade-card-body";
    const activeBtn = document.createElement("button");
    activeBtn.type = "button";
    activeBtn.className = b.id === state.activeBrigadeId ? "primary" : "";
    activeBtn.textContent = b.id === state.activeBrigadeId ? "Active" : "Make Active";
    activeBtn.disabled = b.id === state.activeBrigadeId;
    activeBtn.onclick = () => setActiveBrigade(b.id);
    body.appendChild(activeBtn);
    const nameIn = document.createElement("input");
    nameIn.value = b.name;
    nameIn.placeholder = "Brigade name";
    nameIn.oninput = () => {
      b.name = nameIn.value;
      cardHeader.textContent = b.name;
      if (b.id === state.activeBrigadeId) updateActiveBrigadeLabel();
    };
    const leaderIn = document.createElement("input");
    leaderIn.value = b.leader;
    leaderIn.placeholder = "Brigade leader";
    leaderIn.oninput = () => { b.leader = leaderIn.value; };
    body.appendChild(nameIn);
    body.appendChild(leaderIn);

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "danger";
    delBtn.textContent = "Delete Brigade";
    delBtn.disabled = state.brigades.length <= 1;
    delBtn.onclick = () => deleteBrigade(b.id);
    body.appendChild(delBtn);

    const unitsDiv = document.createElement("div");
    unitsDiv.className = "brigade-units";
    const unitHeader = document.createElement("div");
    unitHeader.className = "brigade-units-header";
    unitHeader.innerHTML = "<span>Unit</span><span>Pts</span>";
    unitsDiv.appendChild(unitHeader);
    const assigned = state.entries.filter((e) => b.unitIds.includes(e.id));
    if (assigned.length === 0) {
      const empty = document.createElement("div");
      empty.className = "meta";
      empty.textContent = "No units assigned";
      unitsDiv.appendChild(empty);
    } else {
      for (const e of assigned) {
        const row = document.createElement("div");
        row.className = "brigade-unit-row";
        const span = document.createElement("span");
        span.textContent = entryLabel(e) + " - " + entryPointsCost(e) + " pts";
        const rm = document.createElement("button");
        rm.type = "button";
        rm.className = "danger";
        rm.textContent = "Remove";
        rm.onclick = () => removeUnitFromBrigade(b, e.id);
        row.appendChild(span);
        row.appendChild(rm);
        unitsDiv.appendChild(row);
      }
    }
    body.appendChild(unitsDiv);

    const count = b.unitIds.length;
    const pts = brigadePoints(b);
    const warn = document.createElement("div");
    warn.className = "meta brigade-summary";
    warn.textContent = count + " units, " + pts + " pts" + (count < 2 || count > 8 ? " (need 2-8)" : "");
    body.appendChild(warn);
    card.appendChild(body);
    list.appendChild(card);
  }
  list.scrollTop = scrollTop;
}

function renderSummary() {
  updateArmyNameDisplay();
  const used = totalPoints();
  const limit = parseInt($("points-limit").value, 10) || 0;
  $("points-used").textContent = used;
  $("unit-count").textContent = state.entries.length;
  $("points-used").style.color = used > limit ? "var(--danger)" : "var(--ok)";
  const panel = $("army-points-total");
  if (panel) {
    panel.textContent = used + " / " + limit + " points";
    panel.style.color = used > limit ? "var(--danger)" : "var(--ok)";
  }
}

function renderAll() {
  renderCatalog();
  renderBrigades();
  renderSummary();
  updateActiveBrigadeLabel();
}

function getFateCards(sheet) {
  sheet = sheet || state.sheet;
  if (!sheet) return [];
  if (sheet.fateCards && sheet.fateCards.length) return sheet.fateCards;
  const embedded = window.VF_FATE_CARDS && window.VF_FATE_CARDS[sheet.id];
  return embedded || [];
}

function ensureFateCards(sheet) {
  if (!sheet) return;
  if (!sheet.fateCards || !sheet.fateCards.length) {
    sheet.fateCards = getFateCards(sheet);
  }
}

function updateEliteOptionLabels(profile) {
  const elite = getEliteCosts();
  const firePts = eliteFireCost(profile);
  $("label-elite-fire").textContent = "Elite +1 Fire (+" + firePts + " pts)";
  $("label-elite-melee").textContent = "Elite +1 Melee (+" + elite.melee + " pts)";
  $("label-elite-tenacity").textContent = "Elite +1 Tenacity (+" + elite.tenacity + " pts)";
}

function openAddDialog(profile) {
  state.pendingUnit = profile;
  $("add-title").textContent = "Add " + profile.name;
  $("add-profile").textContent =
    fmtWeapon(profile) + " | " + fmtStats(profile) + " | base " + profile.points + " pts";
  const us = $("opt-understrength");
  us.checked = false;
  us.disabled = isDetachment(profile);
  $("opt-elite-fire").checked = false;
  $("opt-elite-melee").checked = false;
  $("opt-elite-tenacity").checked = false;
  $("opt-elite-fire").disabled = profile.fire == null;
  updateEliteOptionLabels(profile);
  const unenthusiasticWrap = $("opt-unenthusiastic-wrap");
  const unenthusiasticOpt = getUnenthusiasticOption();
  if (unenthusiasticOpt && canUseUnenthusiastic(profile)) {
    unenthusiasticWrap.classList.remove("hidden");
    $("label-unenthusiastic").textContent = unenthusiasticOpt.label ||
      "Unenthusiastic (-" + (unenthusiasticOpt.pointsDiscount || 6) + " pts, -1 melee & tenacity)";
    $("opt-unenthusiastic").checked = false;
    $("opt-unenthusiastic").disabled = false;
  } else {
    unenthusiasticWrap.classList.add("hidden");
    $("opt-unenthusiastic").checked = false;
  }
  $("add-custom-name").value = "";
  updateAddDialog();
  $("add-dialog").showModal();
}

function getAddOptions() {
  return {
    understrength: $("opt-understrength").checked,
    unenthusiastic: $("opt-unenthusiastic").checked,
    eliteFire: $("opt-elite-fire").checked,
    eliteMelee: $("opt-elite-melee").checked,
    eliteTenacity: $("opt-elite-tenacity").checked,
  };
}

function updateAddDialog() {
  const profile = state.pendingUnit;
  if (!profile) return;
  const opts = getAddOptions();
  const bounds = figureBounds(profile, opts.understrength);
  const figIn = $("add-figures");
  figIn.min = bounds.min;
  figIn.max = bounds.max;
  if (!figIn.value || parseInt(figIn.value, 10) < bounds.min || parseInt(figIn.value, 10) > bounds.max) {
    figIn.value = bounds.min === bounds.max ? bounds.min : bounds.min;
  }
  $("add-cost").textContent = calcCost(profile, opts);
}

function addEntryFromDialog(ev) {
  ev.preventDefault();
  const profile = state.pendingUnit;
  const opts = getAddOptions();
  const figures = parseInt($("add-figures").value, 10);
  const bounds = figureBounds(profile, opts.understrength);
  if (figures < bounds.min || figures > bounds.max) {
    showError("Figures must be between " + bounds.min + " and " + bounds.max + ".");
    return;
  }
  const stats = calcStats(profile, opts);
  const entry = {
    id: state.nextId++,
    profileId: profile.id,
    profileName: profile.name,
    type: profile.type,
    customName: $("add-custom-name").value.trim(),
    figures,
    weapon: profile.weapon,
    rangeInches: profile.rangeInches,
    fire: stats.fire,
    melee: stats.melee,
    tenacity: stats.tenacity,
    specialRules: profile.specialRules.slice(),
    options: opts,
    cost: calcCost(profile, opts),
  };
  state.entries.push(entry);
  autoAssignEntry(entry.id);
  $("add-dialog").close();
  showError("");
  renderAll();
}

function removeEntry(id) {
  state.entries = state.entries.filter((e) => e.id !== id);
  for (const b of state.brigades) {
    b.unitIds = b.unitIds.filter((uid) => uid !== id);
  }
  renderAll();
}

function addBrigade() {
  const n = state.brigades.length + 1;
  state.brigades.push({ id: n, name: n + "th Brigade", leader: "Brigadier", unitIds: [] });
  setActiveBrigade(n);
}

function entryOptionsLabel(e) {
  const opts = [];
  if (e.options.understrength) opts.push("understrength");
  if (e.options.unenthusiastic) opts.push("unenthusiastic");
  if (e.options.eliteFire) opts.push("+1 fire");
  if (e.options.eliteMelee) opts.push("+1 melee");
  if (e.options.eliteTenacity) opts.push("+1 tenacity");
  return opts.length ? " (" + opts.join(", ") + ")" : "";
}

function entryPointsCost(e) {
  if (e.cost != null) return e.cost;
  const profile = state.sheet && state.sheet.units.find((u) => u.id === e.profileId);
  if (!profile) return 0;
  return calcCost(profile, e.options || {});
}

function brigadePoints(brigade) {
  return state.entries
    .filter((e) => brigade.unitIds.includes(e.id))
    .reduce((sum, e) => sum + entryPointsCost(e), 0);
}

function entryDetailLine(e) {
  const fire = e.fire == null ? "-" : e.fire;
  const wpn = fmtWeapon(e);
  let line = entryLabel(e) + entryOptionsLabel(e) +
    " - " + entryPointsCost(e) + " pts" +
    " | " + e.figures + " figs | " + wpn +
    " | F" + fire + " M" + e.melee + " T" + e.tenacity;
  if (e.specialRules && e.specialRules.length) {
    line += " | Special rules: " + e.specialRules.join(", ");
  }
  return line;
}

function sanitizeFilename(name) {
  return (name || "army-list").replace(/[^a-zA-Z0-9 _-]+/g, "").trim().replace(/\s+/g, "-") || "army-list";
}

function collectUsedSpecialRules() {
  const used = new Set();
  for (const e of state.entries) {
    for (const r of e.specialRules || []) used.add(r);
  }
  const order = state.sheet.specialRuleText ? Object.keys(state.sheet.specialRuleText) : [];
  const sorted = order.filter((r) => used.has(r));
  for (const r of used) {
    if (!sorted.includes(r)) sorted.push(r);
  }
  return sorted;
}

function pdfSafeText(text) {
  return String(text)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u00BC/g, "1/4")
    .replace(/\u00BD/g, "1/2")
    .replace(/\u2022/g, "-");
}

function reflowSpecialRuleText(text) {
  const rawLines = pdfSafeText(text).split("\n");
  const parts = [];
  let paragraph = "";

  function flushParagraph() {
    const value = paragraph.trim();
    if (value) parts.push(value);
    paragraph = "";
  }

  for (const raw of rawLines) {
    const line = raw.trim();
    if (!line) {
      flushParagraph();
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("• ")) {
      flushParagraph();
      parts.push("- " + line.replace(/^[-•]\s*/, ""));
      continue;
    }
    paragraph = paragraph ? paragraph + " " + line : line;
  }
  flushParagraph();
  return parts.join("\n");
}

function pdfUnitMainRowData(entry) {
  const fire = entry.fire == null ? "-" : entry.fire;
  const opts = entryOptionsLabel(entry).replace(/^\s*\(/, "").replace(/\)\s*$/, "");
  let unit = entryLabel(entry);
  if (opts) unit += " (" + opts + ")";
  return {
    unit,
    figs: String(entry.figures),
    weapon: fmtWeapon(entry),
    stats: fire + " / " + entry.melee + " / " + entry.tenacity,
    pts: String(entryPointsCost(entry)),
    rules: (entry.specialRules || []).join(", "),
  };
}

function buildArmyPdfDoc() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 12;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - margin * 2;
  let y = 14;

  const colors = {
    gold: [201, 162, 39],
    dark: [35, 29, 23],
    cream: [232, 220, 200],
    border: [92, 74, 50],
    muted: [120, 110, 90],
    rowAlt: [248, 244, 236],
    ruleBg: [252, 250, 246],
    headerFill: [220, 220, 220],
    headerText: [0, 0, 0],
  };

  const tableCols = [
    { key: "unit", label: "Unit", width: 84, align: "left" },
    { key: "figs", label: "Figs", width: 12, align: "center" },
    { key: "weapon", label: "Weapon (Range)", width: 58, align: "left" },
    { key: "stats", label: "F / M / T", width: 20, align: "center" },
    { key: "pts", label: "Pts", width: 12, align: "right" },
  ];
  const tableW = contentW;
  const tableX = margin;
  const tableSize = 9;
  const rulesSize = 10;

  function newPageIf(need) {
    if (y + need > pageH - margin) {
      doc.addPage();
      y = 14;
      return true;
    }
    return false;
  }

  function splitLines(text, width, size, style) {
    doc.setFont("helvetica", style || "normal");
    doc.setFontSize(size);
    return doc.splitTextToSize(pdfSafeText(text), width);
  }

  function writeParagraph(text, size, style, width, lineGap) {
    doc.setFont("helvetica", style || "normal");
    doc.setFontSize(size);
    doc.setTextColor(20, 16, 12);
    const lines = splitLines(text, width || contentW, size);
    const gap = lineGap || size * 0.42 + 1.5;
    for (const line of lines) {
      newPageIf(gap + 2);
      doc.text(line, margin, y);
      y += gap;
    }
  }

  function drawHRule() {
    newPageIf(4);
    doc.setDrawColor(...colors.border);
    doc.setLineWidth(0.3);
    doc.line(margin, y, margin + contentW, y);
    y += 4;
  }

  function drawSectionTitle(title) {
    newPageIf(14);
    const barH = 8;
    doc.setFillColor(220, 220, 220);
    doc.rect(margin, y, contentW, barH, "F");
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
    doc.rect(margin, y, contentW, barH);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text(pdfSafeText(title), margin + 2, y + 5.5);
    y += barH + 4;
  }

  function cellPadding() { return 2.2; }

  function drawTableHeader() {
    const pad = cellPadding();
    const rowH = 8.5;
    newPageIf(rowH + 2);
    let x = tableX;
    doc.setFillColor(220, 220, 220);
    doc.rect(tableX, y, tableW, rowH, "F");
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
    doc.rect(tableX, y, tableW, rowH);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    for (const col of tableCols) {
      const tx = col.align === "center"
        ? x + col.width / 2
        : col.align === "right"
          ? x + col.width - pad
          : x + pad;
      doc.text(col.label, tx, y + 5.5, { align: col.align });
      x += col.width;
    }
    y += rowH;
  }

  function drawTableRow(rowData, alt, size) {
    const pad = cellPadding();
    const fontSize = size || tableSize;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    const cellLines = tableCols.map((col) => {
      const innerW = col.width - pad * 2;
      return splitLines(rowData[col.key] || "", innerW, fontSize);
    });
    const lineH = fontSize * 0.44 + 0.6;
    const rowH = Math.max(...cellLines.map((lines) => lines.length)) * lineH + pad * 2;
    newPageIf(rowH + 1);
    if (alt) {
      doc.setFillColor(...colors.rowAlt);
      doc.rect(tableX, y, tableW, rowH, "F");
    }
    doc.setDrawColor(...colors.border);
    doc.setLineWidth(0.15);
    let x = tableX;
    for (let i = 0; i < tableCols.length; i++) {
      doc.rect(x, y, tableCols[i].width, rowH);
      x += tableCols[i].width;
    }
    doc.setTextColor(20, 16, 12);
    x = tableX;
    for (let i = 0; i < tableCols.length; i++) {
      const col = tableCols[i];
      const lines = cellLines[i];
      const tx = col.align === "center"
        ? x + col.width / 2
        : col.align === "right"
          ? x + col.width - pad
          : x + pad;
      let ty = y + pad + fontSize * 0.35;
      for (const line of lines) {
        doc.text(line, tx, ty, { align: col.align });
        ty += lineH;
      }
      x += col.width;
    }
    y += rowH;
  }

  function drawRulesSubRow(rulesText, alt) {
    if (!rulesText) return;
    const pad = cellPadding();
    const prefix = "Special Rules: ";
    const lines = splitLines(prefix + rulesText, tableW - pad * 2, rulesSize, "italic");
    const lineH = rulesSize * 0.44 + 0.55;
    const rowH = lines.length * lineH + pad * 2;
    newPageIf(rowH + 1);
    doc.setFillColor(...(alt ? colors.rowAlt : [255, 255, 255]));
    doc.rect(tableX, y, tableW, rowH, "F");
    doc.setDrawColor(...colors.border);
    doc.setLineWidth(0.15);
    doc.rect(tableX, y, tableW, rowH);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(rulesSize);
    doc.setTextColor(...colors.muted);
    let ty = y + pad + rulesSize * 0.35;
    for (const line of lines) {
      doc.text(line, tableX + pad, ty);
      ty += lineH;
    }
    y += rowH;
  }

  function drawUnitsTable(units) {
    if (!units.length) {
      writeParagraph("(no units assigned)", 9, "italic", contentW);
      y += 2;
      return;
    }
    const tableTop = y;
    drawTableHeader();
    units.forEach((entry, idx) => {
      const rowData = pdfUnitMainRowData(entry);
      const rules = rowData.rules;
      const alt = idx % 2 === 1;
      drawTableRow(rowData, alt, tableSize);
      drawRulesSubRow(rules, alt);
    });
    doc.setDrawColor(...colors.border);
    doc.setLineWidth(0.35);
    doc.rect(tableX, tableTop, tableW, y - tableTop);
    y += 4;
  }

  function drawFateCardsAppendix() {
    const cards = getFateCards();
    if (!cards.length) return;

    drawHRule();
    drawSectionTitle("Fate Cards");

    const rankW = 16;
    const nameW = 38;
    const textW = contentW - rankW - nameW;
    const pad = cellPadding();
    const rankSize = 10;
    const nameSize = 10;
    const bodySize = 9.5;
    const lineH = bodySize * 0.44 + 0.55;
    const tableTop = y;

    const headerH = 8.5;
    newPageIf(headerH + 2);
    doc.setFillColor(220, 220, 220);
    doc.rect(margin, y, contentW, headerH, "F");
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
    doc.rect(margin, y, contentW, headerH);
    doc.rect(margin, y, rankW, headerH);
    doc.rect(margin + rankW, y, nameW, headerH);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text("Card", margin + pad, y + 5.5);
    doc.text("Name", margin + rankW + pad, y + 5.5);
    doc.text("Effect", margin + rankW + nameW + pad, y + 5.5);
    y += headerH;

    cards.forEach((card, rowIdx) => {
      const body = reflowSpecialRuleText(card.text);
      const rankLines = splitLines(card.rank, rankW - pad * 2, rankSize, "bold");
      const nameLines = splitLines(card.name, nameW - pad * 2, nameSize, "bold");
      const bodyLines = splitLines(body, textW - pad * 2, bodySize, "normal");
      const rowH = Math.max(rankLines.length, nameLines.length, bodyLines.length) * lineH + pad * 2;

      newPageIf(rowH + 1);
      if (rowIdx % 2 === 1) {
        doc.setFillColor(...colors.rowAlt);
        doc.rect(margin, y, contentW, rowH, "F");
      }
      doc.setDrawColor(...colors.border);
      doc.setLineWidth(0.15);
      doc.rect(margin, y, contentW, rowH);
      doc.rect(margin, y, rankW, rowH);
      doc.rect(margin + rankW, y, nameW, rowH);

      let ry = y + pad + rankSize * 0.35;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(rankSize);
      doc.setTextColor(...colors.dark);
      for (const line of rankLines) {
        doc.text(line, margin + pad, ry);
        ry += lineH;
      }

      let ny = y + pad + nameSize * 0.35;
      for (const line of nameLines) {
        doc.text(line, margin + rankW + pad, ny);
        ny += lineH;
      }

      let ty = y + pad + bodySize * 0.35;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(bodySize);
      doc.setTextColor(40, 34, 28);
      for (const line of bodyLines) {
        doc.text(line, margin + rankW + nameW + pad, ty);
        ty += lineH;
      }

      y += rowH;
    });

    doc.setDrawColor(...colors.border);
    doc.setLineWidth(0.35);
    doc.rect(margin, tableTop, contentW, y - tableTop);
    y += 4;
  }

  function drawSpecialRulesAppendix() {
    const rules = collectUsedSpecialRules();
    const texts = state.sheet && state.sheet.specialRuleText;
    if (!rules.length || !texts) return;

    drawHRule();
    drawSectionTitle("Special Rules");

    const ruleNameW = 42;
    const ruleDescW = contentW - ruleNameW;
    const pad = cellPadding();
    const nameSize = 10;
    const bodySize = 10;
    const lineH = bodySize * 0.44 + 0.55;
    const tableTop = y;

    const headerH = 8.5;
    newPageIf(headerH + 2);
    doc.setFillColor(220, 220, 220);
    doc.rect(margin, y, contentW, headerH, "F");
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
    doc.rect(margin, y, contentW, headerH);
    doc.rect(margin, y, ruleNameW, headerH);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text("Rule", margin + pad, y + 5.5);
    doc.text("Description", margin + ruleNameW + pad, y + 5.5);
    y += headerH;

    let rowIdx = 0;
    for (const name of rules) {
      const text = texts[name];
      if (!text) continue;

      const body = reflowSpecialRuleText(text);
      const nameLines = splitLines(name, ruleNameW - pad * 2, nameSize, "bold");
      const bodyLines = splitLines(body, ruleDescW - pad * 2, bodySize, "normal");
      const rowH = Math.max(nameLines.length, bodyLines.length) * lineH + pad * 2;

      newPageIf(rowH + 1);
      if (rowIdx % 2 === 1) {
        doc.setFillColor(...colors.rowAlt);
        doc.rect(margin, y, contentW, rowH, "F");
      }
      doc.setDrawColor(...colors.border);
      doc.setLineWidth(0.15);
      doc.rect(margin, y, contentW, rowH);
      doc.rect(margin, y, ruleNameW, rowH);

      let ny = y + pad + nameSize * 0.35;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(nameSize);
      doc.setTextColor(...colors.dark);
      for (const line of nameLines) {
        doc.text(line, margin + pad, ny);
        ny += lineH;
      }

      let dy = y + pad + bodySize * 0.35;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(bodySize);
      doc.setTextColor(40, 34, 28);
      for (const line of bodyLines) {
        const indent = line.trimStart().startsWith("-") ? 1 : 0;
        doc.text(line, margin + ruleNameW + pad + indent, dy);
        dy += lineH;
      }

      y += rowH;
      rowIdx++;
    }

    doc.setDrawColor(...colors.border);
    doc.setLineWidth(0.35);
    doc.rect(margin, tableTop, contentW, y - tableTop);
    y += 4;
  }

  // Header block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(...colors.dark);
  doc.text("Valour & Fortitude Army List", margin, y);
  y += 9;

  const armyName = getArmyName();
  if (armyName) {
    doc.setFontSize(14);
    doc.setTextColor(...colors.gold);
    doc.text(pdfSafeText(armyName), margin, y);
    y += 8;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...colors.muted);
  writeParagraph(
    "Sheet: " + state.sheet.name + " " + state.sheet.period + " (" + state.sheet.sheetVersion + ")",
    10,
    "normal",
    contentW
  );
  writeParagraph("Army leader: " + (getArmyLeader() || "(unnamed)"), 10, "normal", contentW);
  writeParagraph("Points: " + totalPoints() + " / " + $("points-limit").value, 10, "bold", contentW);
  y += 2;
  drawHRule();

  state.brigades.forEach((b, idx) => {
    if (idx > 0) y += 8;
    drawSectionTitle(b.name + "  |  Leader: " + b.leader);
    drawUnitsTable(state.entries.filter((e) => b.unitIds.includes(e.id)));
  });

  const unassigned = state.entries.filter(
    (e) => !state.brigades.some((br) => br.unitIds.includes(e.id))
  );
  if (unassigned.length) {
    y += 8;
    drawSectionTitle("Unassigned Units");
    drawUnitsTable(unassigned);
  }

  drawSpecialRulesAppendix();
  drawFateCardsAppendix();

  y += 2;
  drawHRule();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...colors.muted);
  writeParagraph("Based on Perry Miniatures V&F army sheets v3.1", 8.5, "normal", contentW);
  writeParagraph(state.sheet.sourceUrl, 8.5, "normal", contentW);

  const filename = sanitizeFilename(armyName || "army-list") + ".pdf";
  return { doc, filename };
}

function closePdfPreview() {
  const frame = $("pdf-preview-frame");
  if (state.pendingPdfUrl) {
    URL.revokeObjectURL(state.pendingPdfUrl);
    state.pendingPdfUrl = null;
  }
  if (frame) frame.src = "about:blank";
  state.pendingPdfDoc = null;
  state.pendingPdfFilename = null;
  const dlg = $("pdf-preview-dialog");
  if (dlg && dlg.open) dlg.close();
}

function savePdfFromPreview() {
  if (!state.pendingPdfDoc || !state.pendingPdfFilename) return;
  state.pendingPdfDoc.save(state.pendingPdfFilename);
  showError("");
}

async function exportPdf() {
  if (!state.sheet) {
    showError("Load an army sheet first.");
    return;
  }
  if (typeof window.jspdf === "undefined") {
    showError("PDF library not loaded. Refresh the page and try again.");
    return;
  }
  if (state.entries.length === 0) {
    showError("Add at least one unit before exporting PDF.");
    return;
  }

  try {
    const res = await fetch("/api/army/" + state.sheet.id, { cache: "no-store" });
    if (res.ok) {
      const fresh = await res.json();
      state.sheet.fateCards = fresh.fateCards || state.sheet.fateCards;
      state.sheet.specialRuleText = fresh.specialRuleText || state.sheet.specialRuleText;
    }
    ensureFateCards(state.sheet);
    closePdfPreview();
    const built = buildArmyPdfDoc();
    state.pendingPdfDoc = built.doc;
    state.pendingPdfFilename = built.filename;
    state.pendingPdfUrl = URL.createObjectURL(built.doc.output("blob"));

    const frame = $("pdf-preview-frame");
    frame.src = state.pendingPdfUrl;
    $("pdf-preview-dialog").showModal();
    showError("");
  } catch (err) {
    console.error(err);
    showError("Could not generate PDF: " + err.message);
  }
}

function clearArmy() {
  if (!confirm("Clear all units and brigades?")) return;
  state.entries = [];
  state.brigades = [{ id: 1, name: "1st Brigade", leader: "Brigadier", unitIds: [] }];
  state.activeBrigadeId = 1;
  state.autoAssignToBrigade = true;
  state.nextId = 1;
  renderAll();
}

function backToSetup() {
  $("screen-builder").classList.add("hidden");
  $("screen-setup").classList.remove("hidden");
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function bindEvents() {
  $("btn-start").onclick = startBuilder;
  $("army-name").addEventListener("input", updateArmyNameDisplay);
  $("army-leader").addEventListener("input", updateArmyNameDisplay);
  $("btn-add-brigade").onclick = addBrigade;
  $("btn-export-pdf").onclick = exportPdf;
  $("btn-pdf-save").onclick = savePdfFromPreview;
  $("btn-pdf-close").onclick = closePdfPreview;
  $("pdf-preview-dialog").addEventListener("close", closePdfPreview);
  $("btn-clear").onclick = clearArmy;
  $("btn-back").onclick = backToSetup;
  $("add-form").onsubmit = addEntryFromDialog;
  $("add-cancel").onclick = () => $("add-dialog").close();
  for (const el of ["opt-understrength","opt-unenthusiastic","opt-elite-fire","opt-elite-melee","opt-elite-tenacity","add-figures"]) {
    $(el).addEventListener("input", updateAddDialog);
    $(el).addEventListener("change", updateAddDialog);
  }
  document.querySelectorAll(".filter").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll(".filter").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.filter = btn.dataset.type;
      renderCatalog();
    };
  });
}

async function init() {
  try {
    await loadCatalog();
    bindEvents();
  } catch (e) {
    showError(e.message);
  }
}

init();