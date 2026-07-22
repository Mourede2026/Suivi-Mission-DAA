// ===========================================================================
// LOGIQUE APPLICATIVE — appelle uniquement la fonction api(fn, args) définie
// par le fichier de transport (JSONP pour GitHub, google.script.run pour
// Apps Script natif). Aucune logique de sécurité ici : tout est revérifié
// côté serveur (Code.gs).
// ===========================================================================

let SESSION = { token: null, nom: null, identifiant: null, qualite: null, role: null, activitesPTA: [] };
let STATE = { activites: [], vehicules: [], missions: [], selectedVehicules: [], segments: [], segMode: 'intervalle', editingRow: null, detailMissionId: null };

// ---------------------------------------------------------------------
// NAVIGATION
// ---------------------------------------------------------------------
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + btn.dataset.panel).classList.add('active');
    if (btn.dataset.panel === 'mon-suivi' && SESSION.token) loadMonSuivi();
    if (btn.dataset.panel === 'comptes' && SESSION.token && SESSION.role === 'Administrateur') loadUsers();
  });
});

function init() {
  loadDashboard(); // toujours chargé, public
}

// ---------------------------------------------------------------------
// CONNEXION / DECONNEXION (un seul formulaire par onglet, même session globale)
// ---------------------------------------------------------------------
document.getElementById('btn-login-m').addEventListener('click', () => doLogin('login-id-m', 'login-pw-m', 'login-alert-missions'));
document.getElementById('btn-login-v').addEventListener('click', () => doLogin('login-id-v', 'login-pw-v', 'login-alert-vehicules'));
document.getElementById('btn-login-s').addEventListener('click', () => doLogin('login-id-s', 'login-pw-s', 'login-alert-suivi'));
document.getElementById('btn-login-c').addEventListener('click', () => doLogin('login-id-c', 'login-pw-c', 'login-alert-comptes'));

function doLogin(idFieldId, pwFieldId, alertId) {
  const identifiant = document.getElementById(idFieldId).value.trim();
  const motDePasse = document.getElementById(pwFieldId).value;
  if (!identifiant || !motDePasse) {
    showAlert(alertId, 'error', 'Merci de renseigner votre identifiant et votre mot de passe.');
    return;
  }
  api('login', [identifiant, motDePasse])
    .then(res => onLoginResult(res, alertId))
    .catch(err => showAlert(alertId, 'error', 'Erreur : ' + (err.message || err)));
}

function onLoginResult(res, alertId) {
  if (!res.success) { showAlert(alertId, 'error', res.error || 'Connexion refusée.'); return; }
  SESSION = { token: res.token, nom: res.nom, identifiant: res.identifiant, qualite: res.qualite, role: res.role, activitesPTA: res.activitesPTA || [] };
  document.getElementById('session-chip').style.display = 'inline-block';
  document.getElementById('session-chip').textContent = res.qualite ? `${res.nom} (${res.qualite})` : `${res.nom} (${res.role})`;
  document.getElementById('btn-logout').style.display = 'inline-block';

  document.getElementById('missions-gate').style.display = 'none';
  document.getElementById('missions-content').style.display = 'block';
  document.getElementById('vehicules-gate').style.display = 'none';
  document.getElementById('vehicules-content').style.display = 'block';
  document.getElementById('mon-suivi-gate').style.display = 'none';
  document.getElementById('mon-suivi-content').style.display = 'block';

  updateVehiculeAccess();
  updateRestrictedTabs();

  if (SESSION.role !== 'Consultation') loadInitialData();
  loadMonSuivi();
  if (SESSION.role === 'Administrateur') {
    document.getElementById('comptes-gate').style.display = 'none';
    document.getElementById('comptes-content').style.display = 'block';
    loadUsers();
  }
}

document.getElementById('btn-logout').addEventListener('click', () => {
  if (SESSION.token) api('logout', [SESSION.token]).catch(() => {});
  SESSION = { token: null, nom: null, identifiant: null, qualite: null, role: null, activitesPTA: [] };
  document.getElementById('session-chip').style.display = 'none';
  document.getElementById('btn-logout').style.display = 'none';
  document.getElementById('missions-gate').style.display = 'block';
  document.getElementById('missions-content').style.display = 'none';
  document.getElementById('vehicules-gate').style.display = 'block';
  document.getElementById('vehicules-content').style.display = 'none';
  document.getElementById('mon-suivi-gate').style.display = 'block';
  document.getElementById('mon-suivi-content').style.display = 'none';
  document.getElementById('comptes-gate').style.display = 'block';
  document.getElementById('comptes-content').style.display = 'none';
  updateRestrictedTabs();
});

function updateVehiculeAccess() {
  const canManage = SESSION.role === 'Gestionnaire Parc' || SESSION.role === 'Administrateur';
  document.getElementById('add-vehicule-card').style.display = canManage ? 'block' : 'none';
  document.getElementById('vehicule-restricted-note').style.display = canManage ? 'none' : 'block';
}

function updateRestrictedTabs() {
  const suiviTab = document.querySelector('.tab[data-panel="mon-suivi"]');
  const comptesTab = document.querySelector('.tab[data-panel="comptes"]');
  const loggedIn = !!SESSION.token;
  suiviTab.style.display = loggedIn ? 'inline-block' : 'none';
  comptesTab.style.display = (loggedIn && SESSION.role === 'Administrateur') ? 'inline-block' : 'none';
}

function onSessionError(err) {
  const msg = (err && err.message) || String(err);
  if (msg.indexOf('SESSION_EXPIREE') !== -1) {
    alert('Votre session a expiré, merci de vous reconnecter.');
    document.getElementById('btn-logout').click();
  } else if (msg.indexOf('ACCES_REFUSE_PROPRIETAIRE') !== -1) {
    showAlert('form-alert', 'error', "Cette mission a déjà été saisie par quelqu'un d'autre : seul son auteur ou un compte Administrateur peut la modifier.");
  } else if (msg.indexOf('ACCES_REFUSE_ACTIVITE') !== -1) {
    showAlert('form-alert', 'error', "Vous n'êtes pas responsable de cette activité PTA : seules vos activités assignées sont modifiables.");
  } else if (msg.indexOf('ACCES_REFUSE') !== -1) {
    alert("Votre compte n'a pas les droits nécessaires pour cette action.");
  } else {
    alert('Erreur : ' + msg);
  }
}

// ---------------------------------------------------------------------
// CHARGEMENT DES DONNEES (connecté)
// ---------------------------------------------------------------------
function loadInitialData() {
  api('getInitialData', [SESSION.token]).then(onInitialData).catch(onSessionError);
}

function onInitialData(data) {
  STATE.activites = data.activites;
  STATE.vehicules = data.vehicules;
  STATE.missions = data.missions;
  SESSION.activitesPTA = data.mesActivites || SESSION.activitesPTA;
  renderActiviteSelect();
  renderVehiculeChips();
  renderMissionsTable();
  renderVehiculesTable();
}

function renderActiviteSelect() {
  const sel = document.getElementById('f-activite');
  let activites = STATE.activites;
  if (SESSION.role === 'Gestionnaire Missions' && SESSION.activitesPTA.length) {
    activites = activites.filter(a => SESSION.activitesPTA.includes(String(a.n)));
  }
  sel.innerHTML = '<option value="">— Aucune (mission hors PTA) —</option>' +
    activites.map(a => `<option value="${a.n}">N°${a.n} - ${escapeHtml(truncate(a.intitule, 70))}</option>`).join('');
}

function renderVehiculeChips() {
  const wrap = document.getElementById('f-vehicules-chips');
  if (STATE.vehicules.length === 0) { wrap.innerHTML = '<span style="color:#888;font-size:12.5px;">Aucun véhicule enregistré. Un Gestionnaire du Parc doit d\'abord en ajouter dans l\'onglet "Véhicules".</span>'; return; }
  wrap.innerHTML = STATE.vehicules.map(v =>
    `<div class="chip ${STATE.selectedVehicules.includes(v.immat) ? 'selected' : ''}" data-immat="${escapeAttr(v.immat)}">${escapeHtml(v.immat)} ${v.statut === 'Hors service' ? '🚫' : ''}</div>`).join('');
  wrap.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const immat = chip.dataset.immat;
      STATE.selectedVehicules = STATE.selectedVehicules.includes(immat)
        ? STATE.selectedVehicules.filter(x => x !== immat) : [...STATE.selectedVehicules, immat];
      renderVehiculeChips();
    });
  });
}

// ---------------------------------------------------------------------
// SEGMENTS DE PERIODE
// ---------------------------------------------------------------------
document.getElementById('mode-intervalle').addEventListener('click', () => setSegMode('intervalle'));
document.getElementById('mode-jour').addEventListener('click', () => setSegMode('jour'));
function setSegMode(mode) {
  STATE.segMode = mode;
  document.getElementById('mode-intervalle').classList.toggle('active', mode === 'intervalle');
  document.getElementById('mode-jour').classList.toggle('active', mode === 'jour');
  document.getElementById('wrap-fin').style.display = mode === 'intervalle' ? '' : 'none';
  document.getElementById('wrap-debut').querySelector('label').textContent = mode === 'intervalle' ? 'Début' : 'Date';
}
setSegMode('intervalle');

document.getElementById('btn-add-segment').addEventListener('click', () => {
  const debut = document.getElementById('seg-debut').value, fin = document.getElementById('seg-fin').value;
  if (!debut) { showAlert('form-alert', 'error', 'Choisissez une date.'); return; }
  if (STATE.segMode === 'intervalle') {
    if (!fin) { showAlert('form-alert', 'error', "Choisissez la date de fin de l'intervalle."); return; }
    if (fin < debut) { showAlert('form-alert', 'error', 'La date de fin doit être après la date de début.'); return; }
    STATE.segments.push({ type: 'intervalle', debut, fin });
  } else { STATE.segments.push({ type: 'jour', debut }); }
  clearAlert();
  document.getElementById('seg-debut').value = ''; document.getElementById('seg-fin').value = '';
  renderSegments();
});

function renderSegments() {
  const wrap = document.getElementById('segments-list');
  wrap.innerHTML = STATE.segments.map((s, i) => `
    <div class="chip removable">${s.type === 'intervalle' ? fmtISOtoDMY(s.debut) + ' → ' + fmtISOtoDMY(s.fin) : fmtISOtoDMY(s.debut)}
      <button type="button" onclick="removeSegment(${i})">✕</button></div>`).join('');
  const nbJours = countJours(STATE.segments);
  document.getElementById('nb-jours').textContent = STATE.segments.length
    ? `Total : ${nbJours} jour${nbJours > 1 ? 's' : ''} réservé${nbJours > 1 ? 's' : ''} pour le(s) véhicule(s) choisis.` : '';
}
function removeSegment(i) { STATE.segments.splice(i, 1); renderSegments(); }
function countJours(segments) {
  const set = new Set();
  segments.forEach(s => {
    if (s.type === 'jour') { set.add(s.debut); return; }
    let cur = new Date(s.debut), fin = new Date(s.fin);
    while (cur <= fin) { set.add(cur.toISOString().slice(0, 10)); cur.setDate(cur.getDate() + 1); }
  });
  return set.size;
}
function fmtISOtoDMY(iso) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }
function segmentsToText(segments) {
  return segments.map(s => s.type === 'intervalle' ? `${fmtISOtoDMY(s.debut)}-${fmtISOtoDMY(s.fin)}` : fmtISOtoDMY(s.debut)).join(', ');
}
function textToSegments(text) {
  if (!text) return [];
  return text.split(',').map(t => t.trim()).filter(Boolean).map(tok => {
    const parts = tok.split('-').map(p => p.trim());
    if (parts.length === 2) return { type: 'intervalle', debut: dmyToISO(parts[0]), fin: dmyToISO(parts[1]) };
    return { type: 'jour', debut: dmyToISO(parts[0]) };
  }).filter(s => s.debut);
}
function dmyToISO(s) { const m = (s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (!m) return ''; return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }

// ---------------------------------------------------------------------
// FORMULAIRE MISSION
// ---------------------------------------------------------------------
document.getElementById('btn-new-hors-pta').addEventListener('click', () => openMissionForm(null));
document.getElementById('btn-cancel-edit').addEventListener('click', closeMissionForm);
document.getElementById('btn-save').addEventListener('click', saveMission);

function openMissionForm(row) {
  document.getElementById('edit-card').style.display = 'block';
  document.getElementById('detail-card').style.display = 'none';
  clearAlert();
  if (row) {
    const m = STATE.missions.find(x => x.row === row);
    document.getElementById('form-title').textContent = 'Compléter / modifier la mission ' + m.id;
    document.getElementById('f-intitule').value = m.intitule || '';
    document.getElementById('f-resultats').value = m.resultatsAttendus || '';
    document.getElementById('f-financement').value = m.financement || 'Fonds Propres';
    document.getElementById('f-cout').value = m.cout || '';
    document.getElementById('f-statut').value = m.statut || 'Non réalisé';
    document.getElementById('f-moyen-hors-flotte').value = m.moyenHorsFlotte || '';
    document.getElementById('f-km').value = m.kilometrage || '';
    document.getElementById('f-carburant').value = m.carburant || '';
    STATE.selectedVehicules = (m.vehicules || []).slice();
    STATE.segments = textToSegments(m.joursEngages || '');
    STATE.editingRow = row;
    if (m.activiteN) {
      document.getElementById('wrap-activite-select').style.display = 'none';
      document.getElementById('wrap-activite-readonly').style.display = 'block';
      document.getElementById('f-activite-readonly').textContent = `N°${m.activiteN} - ${m.intitule}`;
    } else {
      document.getElementById('wrap-activite-select').style.display = 'block';
      document.getElementById('wrap-activite-readonly').style.display = 'none';
      document.getElementById('f-activite').value = '';
    }
  } else {
    document.getElementById('form-title').textContent = 'Nouvelle mission hors PTA';
    document.getElementById('f-intitule').value = '';
    document.getElementById('f-resultats').value = '';
    document.getElementById('f-financement').value = 'Fonds Propres';
    document.getElementById('f-cout').value = '';
    document.getElementById('f-statut').value = 'Non réalisé';
    document.getElementById('f-moyen-hors-flotte').value = '';
    document.getElementById('f-km').value = '';
    document.getElementById('f-carburant').value = '';
    STATE.selectedVehicules = []; STATE.segments = []; STATE.editingRow = null;
    document.getElementById('wrap-activite-select').style.display = 'block';
    document.getElementById('wrap-activite-readonly').style.display = 'none';
    document.getElementById('f-activite').value = '';
  }
  renderVehiculeChips(); renderSegments();
  document.getElementById('edit-card').scrollIntoView({ behavior: 'smooth' });
}

function closeMissionForm() {
  document.getElementById('edit-card').style.display = 'none';
  STATE.editingRow = null; STATE.segments = []; STATE.selectedVehicules = [];
  clearAlert();
}

function saveMission() {
  const joursEngages = segmentsToText(STATE.segments);
  const joursDates = parseJoursEngagesClient(joursEngages);
  const vehiculesList = STATE.selectedVehicules;
  const intitule = document.getElementById('f-intitule').value.trim();

  clearAlert();
  if (!intitule || joursDates.length === 0) {
    showAlert('form-alert', 'error', "Merci de renseigner l'intitulé et au moins une période (le véhicule est optionnel).");
    return;
  }

  const activiteReadonly = document.getElementById('wrap-activite-readonly').style.display !== 'none';
  const data = {
    activiteN: activiteReadonly ? undefined : document.getElementById('f-activite').value,
    intitule: intitule,
    joursEngages: joursEngages,
    vehicules: vehiculesList.join(', '),
    moyenHorsFlotte: document.getElementById('f-moyen-hors-flotte').value.trim(),
    resultatsAttendus: document.getElementById('f-resultats').value.trim(),
    financement: document.getElementById('f-financement').value,
    cout: parseFloat(document.getElementById('f-cout').value) || 0,
    statut: document.getElementById('f-statut').value,
    kilometrage: parseFloat(document.getElementById('f-km').value) || '',
    carburant: document.getElementById('f-carburant').value.trim()
  };

  const btn = document.getElementById('btn-save');
  btn.disabled = true; btn.textContent = 'Enregistrement…';

  const done = (res) => {
    btn.disabled = false; btn.textContent = 'Enregistrer';
    if (!res.success) {
      if (res.error === 'CONFLIT_VEHICULE') {
        const list = res.conflicts.map(c =>
          `<li><b>${escapeHtml(c.id)}</b> - ${escapeHtml(c.intitule)}, véhicule(s) : ${escapeHtml(c.vehicules.join(', '))} — jour(s) déjà réservé(s) en commun : ${escapeHtml(c.joursCommuns.join(', '))}</li>`).join('');
        showAlert('form-alert', 'error', `⚠️ Conflit détecté :<ul style="margin:6px 0 0 18px;">${list}</ul>`);
      } else {
        showAlert('form-alert', 'error', res.error || "Erreur lors de l'enregistrement.");
      }
      return;
    }
    closeMissionForm();
    loadInitialData();
  };

  const call = STATE.editingRow ? api('updateMission', [SESSION.token, STATE.editingRow, data]) : api('addMission', [SESSION.token, data]);
  call.then(done).catch(err => { btn.disabled = false; btn.textContent = 'Enregistrer'; onSessionError(err); });
}

function parseJoursEngagesClient(texte) {
  if (!texte) return [];
  const jours = new Set();
  texte.split(',').map(t => t.trim()).filter(Boolean).forEach(tok => {
    const parts = tok.split('-').map(p => p.trim());
    if (parts.length === 1) { jours.add(parts[0]); }
    else if (parts.length === 2) {
      let cur = new Date(dmyToISO(parts[0])), fin = new Date(dmyToISO(parts[1]));
      while (cur <= fin) { jours.add(cur.toISOString().slice(0, 10)); cur.setDate(cur.getDate() + 1); }
    }
  });
  return Array.from(jours);
}

function clearAlert() { document.getElementById('form-alert').innerHTML = ''; }
function showAlert(id, type, html) { document.getElementById(id).innerHTML = `<div class="alert alert-${type}">${html}</div>`; }

// ---------------------------------------------------------------------
// DUPLICATION / VALIDATION / DETAIL (commentaires + historique)
// ---------------------------------------------------------------------
function dupliquerMission(row) {
  api('dupliquerMission', [SESSION.token, row]).then(res => {
    if (!res.success) { alert(res.error || 'Erreur.'); return; }
    loadInitialData();
  }).catch(onSessionError);
}

function validerMission(row) {
  api('validerMission', [SESSION.token, row]).then(res => {
    if (!res.success) { alert(res.error || 'Erreur.'); return; }
    loadInitialData();
  }).catch(onSessionError);
}

function openDetail(missionId) {
  document.getElementById('edit-card').style.display = 'none';
  document.getElementById('detail-card').style.display = 'block';
  document.getElementById('detail-title').textContent = 'Détails de la mission ' + missionId;
  STATE.detailMissionId = missionId;
  loadCommentaires();
  loadHistorique();
  document.getElementById('detail-card').scrollIntoView({ behavior: 'smooth' });
}
document.getElementById('btn-close-detail').addEventListener('click', () => {
  document.getElementById('detail-card').style.display = 'none';
});

function loadCommentaires() {
  api('getCommentaires', [SESSION.token, STATE.detailMissionId]).then(list => {
    const wrap = document.getElementById('commentaires-list');
    wrap.innerHTML = list.length ? list.map(c => `<div class="comment-item"><div class="meta">${escapeHtml(c.nomAffiche)} · ${escapeHtml(c.date)}</div>${escapeHtml(c.texte)}</div>`).join('') : '<div class="empty">Aucun commentaire.</div>';
  }).catch(onSessionError);
}
document.getElementById('btn-add-commentaire').addEventListener('click', () => {
  const texte = document.getElementById('new-commentaire').value.trim();
  if (!texte) return;
  api('addCommentaire', [SESSION.token, STATE.detailMissionId, texte]).then(res => {
    if (res.success) { document.getElementById('new-commentaire').value = ''; loadCommentaires(); }
  }).catch(onSessionError);
});

function loadHistorique() {
  api('getHistorique', [SESSION.token, STATE.detailMissionId]).then(list => {
    const wrap = document.getElementById('historique-list');
    wrap.innerHTML = list.length ? list.map(h => `<div class="hist-item">${escapeHtml(h.date)} — <b>${escapeHtml(h.action)}</b> par ${escapeHtml(h.nomAffiche)} ${h.detail ? '(' + escapeHtml(h.detail) + ')' : ''}</div>`).join('') : '<div class="empty">Aucun historique.</div>';
  }).catch(onSessionError);
}

// ---------------------------------------------------------------------
// EXPORT CSV
// ---------------------------------------------------------------------
document.getElementById('btn-export-csv').addEventListener('click', () => {
  api('exportMissionsCSV', [SESSION.token]).then(res => {
    if (!res.success) { alert(res.error || 'Erreur export.'); return; }
    const blob = new Blob(["\uFEFF" + res.csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = res.filename; document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }).catch(onSessionError);
});

// ---------------------------------------------------------------------
// TABLE MISSIONS
// ---------------------------------------------------------------------
document.getElementById('filter-planif').addEventListener('change', () => renderMissionsTable());
document.getElementById('search-missions').addEventListener('input', () => renderMissionsTable());

function renderMissionsTable() {
  const wrap = document.getElementById('missions-table-wrap');
  const filterMode = document.getElementById('filter-planif').value;
  const search = document.getElementById('search-missions').value.toLowerCase();
  let missions = STATE.missions;

  if (SESSION.role === 'Gestionnaire Missions' && SESSION.activitesPTA.length) {
    missions = missions.filter(m => !m.activiteN || SESSION.activitesPTA.includes(String(m.activiteN)) || m.identifiantSaisisseur === SESSION.identifiant);
  }

  if (filterMode === 'non-planifiees') missions = missions.filter(m => m.nbJours === 0);
  else if (filterMode === 'planifiees') missions = missions.filter(m => m.nbJours > 0);
  else if (filterMode === 'mes-saisies') missions = missions.filter(m => m.identifiantSaisisseur === SESSION.identifiant);
  else if (filterMode === 'a-valider') missions = missions.filter(m => m.statutValidation === 'À valider');

  if (search) missions = missions.filter(m => (m.intitule || '').toLowerCase().includes(search) || (m.vehicules || []).join(' ').toLowerCase().includes(search));

  if (missions.length === 0) { wrap.innerHTML = '<div class="empty">Aucune mission ne correspond à ce filtre.</div>'; return; }

  wrap.innerHTML = `<table><thead><tr><th>ID</th><th>N° PTA</th><th>Intitulé</th><th>Jours engagés</th><th>Véhicule(s) / Moyen</th><th>Saisi par</th><th>Statut</th><th>Validation</th><th></th></tr></thead><tbody>
    ${missions.map(m => {
      const canEditOwnership = !m.identifiantSaisisseur || m.identifiantSaisisseur === SESSION.identifiant || SESSION.role === 'Administrateur';
      const canEditActivite = SESSION.role === 'Administrateur' || !m.activiteN || (SESSION.role === 'Gestionnaire Missions' && SESSION.activitesPTA.includes(String(m.activiteN)));
      const canEdit = canEditOwnership && canEditActivite;
      let actions = canEdit
        ? `<button class="btn btn-secondary btn-sm" onclick="openMissionForm(${m.row})">${m.nbJours > 0 ? 'Modifier' : 'Compléter'}</button>`
        : `<button class="btn btn-secondary btn-sm" disabled title="Réservé à l'auteur / au responsable de l'activité">🔒</button>`;
      actions += ` <button class="btn btn-secondary btn-sm" onclick="dupliquerMission(${m.row})" title="Dupliquer">⧉</button>`;
      actions += ` <button class="btn btn-secondary btn-sm" onclick="openDetail('${escapeAttr(m.id)}')" title="Commentaires / historique">💬</button>`;
      if (SESSION.role === 'Administrateur' && m.statutValidation === 'À valider') {
        actions += ` <button class="btn btn-primary btn-sm" onclick="validerMission(${m.row})">Valider</button>`;
      }
      const vehiculeAffiche = (m.vehicules && m.vehicules.length) ? m.vehicules.join(', ') : (m.moyenHorsFlotte ? m.moyenHorsFlotte + ' (hors flotte)' : '');
      let validationBadge = '<span class="badge" style="background:#eef2f7;color:#555;">—</span>';
      if (m.statutValidation === 'À valider') validationBadge = '<span class="badge badge-valider">À valider</span>';
      else if (m.statutValidation === 'Validée') validationBadge = '<span class="badge badge-validee">Validée</span>';
      return `<tr>
      <td>${escapeHtml(m.id)}</td>
      <td>${m.activiteN ? escapeHtml(String(m.activiteN)) : '<span style="color:var(--gris);">hors PTA</span>'}</td>
      <td>${escapeHtml(truncate(m.intitule, 60))}</td>
      <td>${m.nbJours > 0 ? escapeHtml(m.joursEngages) + ` <span style="color:var(--gris);">(${m.nbJours} j.)</span>` : '<span style="color:var(--gris);">—</span>'}</td>
      <td>${escapeHtml(vehiculeAffiche) || '<span style="color:var(--gris);">Aucun</span>'}</td>
      <td>${escapeHtml(m.saisiPar || '') || '<span style="color:var(--gris);">—</span>'}</td>
      <td>${m.statut === 'Réalisé' ? '<span class="badge badge-ok">Réalisé</span>' : '<span class="badge" style="background:#eef2f7;color:#555;">Non réalisé</span>'}</td>
      <td>${validationBadge}</td>
      <td style="white-space:nowrap;">${actions}</td>
    </tr>`;
    }).join('')}</tbody></table>`;
}

// ---------------------------------------------------------------------
// VEHICULES
// ---------------------------------------------------------------------
document.getElementById('btn-add-vehicule').addEventListener('click', () => {
  const data = {
    immat: document.getElementById('v-immat').value.trim(),
    modele: document.getElementById('v-modele').value.trim(),
    type: document.getElementById('v-type').value,
    statut: document.getElementById('v-statut').value,
    affectation: document.getElementById('v-affectation').value.trim(),
    observations: document.getElementById('v-observations').value.trim()
  };
  if (!data.immat) { showAlert('vehicule-alert', 'error', "Merci de renseigner l'immatriculation."); return; }
  api('addVehicule', [SESSION.token, data]).then(() => {
    document.getElementById('v-immat').value = ''; document.getElementById('v-modele').value = '';
    document.getElementById('v-affectation').value = ''; document.getElementById('v-observations').value = '';
    showAlert('vehicule-alert', 'success', '✅ Véhicule ajouté.');
    loadInitialData();
  }).catch(err => showAlert('vehicule-alert', 'error', 'Erreur : ' + (err.message || err)));
});

function renderVehiculesTable() {
  const wrap = document.getElementById('vehicules-table-wrap');
  const canManage = SESSION.role === 'Gestionnaire Parc' || SESSION.role === 'Administrateur';
  if (STATE.vehicules.length === 0) { wrap.innerHTML = '<div class="empty">Aucun véhicule enregistré.</div>'; return; }
  wrap.innerHTML = `<table><thead><tr><th>ID</th><th>Immat.</th><th>Modèle</th><th>Type</th><th>Statut</th><th>Affectation</th></tr></thead><tbody>
    ${STATE.vehicules.map(v => `<tr><td>${escapeHtml(v.id)}</td><td>${escapeHtml(v.immat)}</td><td>${escapeHtml(v.modele || '')}</td><td>${escapeHtml(v.type || '')}</td>
      <td>${canManage
        ? `<select onchange="changeStatut(${v.row}, this.value)">${['Disponible','En mission','En maintenance','Hors service'].map(s => `<option ${s === v.statut ? 'selected' : ''}>${s}</option>`).join('')}</select>`
        : escapeHtml(v.statut || '')}</td>
      <td>${escapeHtml(v.affectation || '')}</td></tr>`).join('')}</tbody></table>`;
}
function changeStatut(row, statut) {
  api('updateVehiculeStatut', [SESSION.token, row, statut]).then(loadInitialData).catch(onSessionError);
}

// ---------------------------------------------------------------------
// MON SUIVI (tableau de bord personnel par activité)
// ---------------------------------------------------------------------
function loadMonSuivi() {
  if (!SESSION.token) return;
  api('getMonDashboard', [SESSION.token]).then(renderMonSuivi).catch(onSessionError);
}

function renderMonSuivi(d) {
  const wrap = document.getElementById('mon-suivi-content');
  if (d.role === 'Consultation' || d.role === 'Gestionnaire Parc') {
    wrap.innerHTML = `<div class="card"><div class="empty">Votre rôle n'est pas rattaché à des activités PTA. Consultez le tableau de bord général.</div></div>`;
    return;
  }
  if (d.activites.length === 0) {
    wrap.innerHTML = `<div class="card"><div class="empty">Aucune activité PTA ne vous est encore assignée. Contactez l'administrateur pour être rattaché à une ou plusieurs activités.</div></div>`;
    return;
  }
  wrap.innerHTML = `
    <div class="card">
      <h2>Avancement de mes activités PTA</h2>
      ${d.activites.map(a => `
        <div class="activite-card">
          <div class="titre">N°${escapeHtml(String(a.n))} - ${escapeHtml(a.intitule)}</div>
          <div style="font-size:12.5px;color:var(--gris);margin-bottom:6px;">${escapeHtml(a.structureResp || '')} · Budget : ${escapeHtml(String(a.coutBudgetise || 0))} milliers FCFA · Engagé : ${escapeHtml(String(a.budgetEngage))} milliers FCFA</div>
          <div style="font-size:12.5px;">Planification : ${a.planifiees}/${a.nbMissions} mission(s) planifiée(s) (${a.pctPlanifie}%)</div>
          <div class="progress-bar"><div style="width:${a.pctPlanifie}%;"></div></div>
          <div style="font-size:12.5px;margin-top:6px;">Réalisation : ${a.realisees}/${a.nbMissions} mission(s) réalisée(s) (${a.pctRealise}%)</div>
          <div class="progress-bar"><div style="width:${a.pctRealise}%;background:var(--bleu);"></div></div>
          ${a.prochaineMission ? `<div style="font-size:12px;margin-top:8px;color:var(--bleu);">Prochaine échéance : ${escapeHtml(a.prochaineMission.id)} - ${escapeHtml(a.prochaineMission.joursEngages)}</div>` : ''}
        </div>`).join('')}
    </div>
    <div class="card">
      <h2>Mes dernières saisies</h2>
      ${d.mesMissionsRecentes.length === 0 ? '<div class="empty">Aucune saisie pour le moment.</div>' : `<table><thead><tr><th>ID</th><th>Intitulé</th><th>Statut</th><th>Date de saisie</th></tr></thead><tbody>
        ${d.mesMissionsRecentes.map(m => `<tr><td>${escapeHtml(m.id)}</td><td>${escapeHtml(truncate(m.intitule, 50))}</td><td>${escapeHtml(m.statut)}</td><td>${escapeHtml(m.dateSaisie || '')}</td></tr>`).join('')}
      </tbody></table>`}
    </div>`;
}

// ---------------------------------------------------------------------
// GESTION DES COMPTES (Administrateur)
// ---------------------------------------------------------------------
document.getElementById('u-role').addEventListener('change', updateUserFormFields);
function updateUserFormFields() {
  const role = document.getElementById('u-role').value;
  document.getElementById('u-activites-wrap').style.display = role === 'Gestionnaire Missions' ? 'block' : 'none';
}
updateUserFormFields();

document.getElementById('btn-add-user').addEventListener('click', () => {
  const data = {
    nom: document.getElementById('u-nom').value.trim(),
    identifiant: document.getElementById('u-id').value.trim(),
    motDePasse: document.getElementById('u-pw').value,
    qualite: document.getElementById('u-qualite').value.trim(),
    role: document.getElementById('u-role').value,
    activitesPTA: document.getElementById('u-activites').value.trim(),
    observations: document.getElementById('u-observations').value.trim()
  };
  if (!data.nom || !data.identifiant || !data.motDePasse) {
    showAlert('user-alert', 'error', 'Nom, identifiant et mot de passe sont obligatoires.');
    return;
  }
  api('addUser', [SESSION.token, data]).then(res => {
    if (!res.success) { showAlert('user-alert', 'error', res.error || 'Erreur.'); return; }
    ['u-nom','u-id','u-pw','u-qualite','u-activites','u-observations'].forEach(id => document.getElementById(id).value = '');
    showAlert('user-alert', 'success', '✅ Compte créé.');
    loadUsers();
  }).catch(onSessionError);
});

function loadUsers() {
  api('listUsers', [SESSION.token]).then(renderUsers).catch(onSessionError);
}

function renderUsers(users) {
  const wrap = document.getElementById('users-table-wrap');
  wrap.innerHTML = `<table><thead><tr><th>Nom</th><th>Identifiant</th><th>Rôle</th><th>Activités PTA</th><th>Actif</th><th></th></tr></thead><tbody>
    ${users.map(u => `<tr>
      <td>${escapeHtml(u.nom)}</td>
      <td>${escapeHtml(u.identifiant)}</td>
      <td>${escapeHtml(u.role)}</td>
      <td>${escapeHtml(u.activitesPTA || '—')}</td>
      <td>${u.actif ? '<span class="badge badge-ok">Actif</span>' : '<span class="badge badge-warn">Désactivé</span>'}</td>
      <td style="white-space:nowrap;">
        <button class="btn btn-secondary btn-sm" onclick="toggleUserActive(${u.row}, ${!u.actif})">${u.actif ? 'Désactiver' : 'Activer'}</button>
        <button class="btn btn-secondary btn-sm" onclick="resetUserPassword(${u.row})">Réinitialiser mdp</button>
      </td>
    </tr>`).join('')}</tbody></table>`;
}

function toggleUserActive(row, actif) {
  api('setUserActive', [SESSION.token, row, actif]).then(loadUsers).catch(onSessionError);
}

function resetUserPassword(row) {
  const pwd = prompt("Nouveau mot de passe (4 caractères minimum) :");
  if (!pwd) return;
  api('resetPassword', [SESSION.token, row, pwd]).then(res => {
    if (!res.success) { alert(res.error || 'Erreur.'); return; }
    alert('Mot de passe réinitialisé.');
  }).catch(onSessionError);
}

// ---------------------------------------------------------------------
// DASHBOARD (public)
// ---------------------------------------------------------------------
function loadDashboard() {
  api('getDashboard', []).then(renderDashboard).catch(err => {
    document.getElementById('dashboard-content').innerHTML = `<div class="alert alert-error">Erreur de chargement : ${escapeHtml(err.message || String(err))}</div>`;
  });
}

function renderDashboard(d) {
  const total = d.disponibilite.length;
  const occupes = d.disponibilite.filter(v => v.occupeAujourdhui).length;
  const disponibles = total - occupes;
  const prochaines = d.prochainesMissions.length;
  const pctPlanif = d.avancementPTA.total ? Math.round(100 * d.avancementPTA.planifiees / d.avancementPTA.total) : 0;
  const pctRealise = d.avancementPTA.total ? Math.round(100 * d.avancementPTA.realisees / d.avancementPTA.total) : 0;

  const html = `
    <div class="kpi-row">
      <div class="kpi"><div class="n">${total}</div><div class="l">Véhicules au parc</div></div>
      <div class="kpi"><div class="n" style="color:var(--vert)">${disponibles}</div><div class="l">Disponibles aujourd'hui</div></div>
      <div class="kpi"><div class="n" style="color:var(--orange)">${occupes}</div><div class="l">En mission aujourd'hui</div></div>
      <div class="kpi"><div class="n">${prochaines}</div><div class="l">Sollicitations (30j)</div></div>
    </div>
    <div class="card">
      <h2>Avancement de la planification du PTA</h2>
      <p style="font-size:13px;color:var(--gris);margin:0 0 4px;">${d.avancementPTA.planifiees} / ${d.avancementPTA.total} activités planifiées (${pctPlanif}%)</p>
      <div class="progress-bar"><div style="width:${pctPlanif}%;"></div></div>
      <p style="font-size:13px;color:var(--gris);margin:10px 0 4px;">${d.avancementPTA.realisees} / ${d.avancementPTA.total} activités réalisées (${pctRealise}%)</p>
      <div class="progress-bar"><div style="width:${pctRealise}%;background:var(--bleu);"></div></div>
    </div>
    <div class="card"><h2>Disponibilité des véhicules (${d.dateJour})</h2>
      ${total === 0 ? '<div class="empty">Aucun véhicule enregistré.</div>' : `<table><thead><tr><th>Immat.</th><th>Modèle</th><th>Statut déclaré</th><th>Aujourd'hui</th><th>Mission en cours</th><th>Occupation ce mois</th></tr></thead><tbody>
        ${d.disponibilite.map(v => {
          const occ = (d.occupationVehicules || []).find(o => o.immat === v.immat);
          return `<tr><td>${escapeHtml(v.immat)}</td><td>${escapeHtml(v.modele || '')}</td><td>${escapeHtml(v.statutDeclare || '')}</td>
          <td>${v.occupeAujourdhui ? '<span class="badge badge-occupe">Occupé</span>' : '<span class="badge badge-dispo">Disponible</span>'}</td><td>${escapeHtml(v.missionEnCours || '-')}</td>
          <td>${occ ? occ.tauxOccupationPct + '%' : '—'}</td></tr>`;
        }).join('')}
      </tbody></table>`}
    </div>
    <div class="card"><h2>Prochaines sollicitations (30 prochains jours)</h2>
      ${prochaines === 0 ? '<div class="empty">Aucune mission planifiée dans les 30 prochains jours.</div>' : `<table><thead><tr><th>ID</th><th>Intitulé</th><th>Véhicule(s)</th><th>Jours engagés</th></tr></thead><tbody>
        ${d.prochainesMissions.map(m => `<tr><td>${escapeHtml(m.id)}</td><td>${escapeHtml(m.intitule)}</td><td>${escapeHtml((m.vehicules || []).join(', '))}</td><td>${escapeHtml(m.joursEngages)}</td></tr>`).join('')}
      </tbody></table>`}
    </div>`;
  document.getElementById('dashboard-content').innerHTML = html;
}

// ---------------------------------------------------------------------
// UTILS
// ---------------------------------------------------------------------
function escapeHtml(s) { return (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function escapeAttr(s) { return escapeHtml(s); }
function truncate(s, n) { s = s || ''; return s.length > n ? s.slice(0, n) + '…' : s; }

init();
