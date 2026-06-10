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
    const activeBtn = document.createElement("button");
    activeBtn.type = "button";
    activeBtn.className = b.id === state.activeBrigadeId ? "primary" : "";
    activeBtn.textContent = b.id === state.activeBrigadeId ? "Active" : "Make Active";
    activeBtn.disabled = b.id === state.activeBrigadeId;
    activeBtn.onclick = () => setActiveBrigade(b.id);
    card.appendChild(activeBtn);
    const nameIn = document.createElement("input");
    nameIn.value = b.name;
    nameIn.placeholder = "Brigade name";
    nameIn.oninput = () => { b.name = nameIn.value; if (b.id === state.activeBrigadeId) updateActiveBrigadeLabel(); };
    const leaderIn = document.createElement("input");
    leaderIn.value = b.leader;
    leaderIn.placeholder = "Brigade leader";
    leaderIn.oninput = () => { b.leader = leaderIn.value; };
    card.appendChild(nameIn);
    card.appendChild(leaderIn);

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "danger";
    delBtn.textContent = "Delete Brigade";
    delBtn.disabled = state.brigades.length <= 1;
    delBtn.onclick = () => deleteBrigade(b.id);
    card.appendChild(delBtn);

    const unitsDiv = document.createElement("div");
    unitsDiv.className = "brigade-units";
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
    card.appendChild(unitsDiv);

    const count = b.unitIds.length;
    const pts = brigadePoints(b);
    const warn = document.createElement("div");
    warn.className = "meta brigade-summary";
    warn.textContent = count + " units, " + pts + " pts" + (count < 2 || count > 8 ? " (need 2-8)" : "");
    card.appendChild(warn);
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

function writeSpecialRulesAppendix(writeLine) {
  const rules = collectUsedSpecialRules();
  const texts = state.sheet && state.sheet.specialRuleText;
  if (!rules.length || !texts) return;
  y += 2;
  writeLine("Special Rules", 11, "bold");
  for (const name of rules) {
    const text = texts[name];
    if (!text) continue;
    writeLine(name, 9, "bold");
    for (const line of text.split("\n")) {
      writeLine(line, 8);
    }
    y += 1;
  }
}

function buildArmyPdfDoc() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 14;
  const pageW = doc.internal.pageSize.getWidth();
  const maxW = pageW - margin * 2;
  let y = 18;

  function newPageIf(need) {
    const pageH = doc.internal.pageSize.getHeight();
    if (y + need > pageH - margin) {
      doc.addPage();
      y = 18;
    }
  }

  function writeLine(text, size, style) {
    newPageIf(8);
    doc.setFont("helvetica", style || "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, maxW);
    for (const line of lines) {
      newPageIf(6);
      doc.text(line, margin, y);
      y += size * 0.45 + 2.5;
    }
  }

  const armyName = getArmyName();
  writeLine("Valour & Fortitude Army List", 16, "bold");
  if (armyName) writeLine(armyName, 13, "bold");
  writeLine(
    "Sheet: " + state.sheet.name + " " + state.sheet.period + " (" + state.sheet.sheetVersion + ")",
    10
  );
  writeLine("Army leader: " + (getArmyLeader() || "(unnamed)"), 10);
  writeLine("Points: " + totalPoints() + " / " + $("points-limit").value, 10);
  y += 2;

  for (const b of state.brigades) {
    writeLine(b.name + " - Leader: " + b.leader, 11, "bold");
    const units = state.entries.filter((e) => b.unitIds.includes(e.id));
    if (units.length === 0) {
      writeLine("  (no units assigned)", 9);
    } else {
      for (const e of units) {
        writeLine("  " + entryDetailLine(e), 9);
      }
    }
    y += 1;
  }

  const unassigned = state.entries.filter(
    (e) => !state.brigades.some((b) => b.unitIds.includes(e.id))
  );
  if (unassigned.length) {
    writeLine("Unassigned units", 11, "bold");
    for (const e of unassigned) {
      writeLine("  " + entryDetailLine(e), 9);
    }
  }

  writeSpecialRulesAppendix(writeLine);

  y += 2;
  writeLine("Based on Perry Miniatures V&F army sheets v3.1", 8);
  writeLine(state.sheet.sourceUrl, 8);

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

function exportPdf() {
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

  closePdfPreview();
  const built = buildArmyPdfDoc();
  state.pendingPdfDoc = built.doc;
  state.pendingPdfFilename = built.filename;
  state.pendingPdfUrl = URL.createObjectURL(built.doc.output("blob"));

  const frame = $("pdf-preview-frame");
  frame.src = state.pendingPdfUrl;
  $("pdf-preview-dialog").showModal();
  showError("");
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