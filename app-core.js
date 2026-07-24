// ===========================================================================
// LOGIQUE APPLICATIVE — appelle uniquement api(fn, args) (transport-jsonp.js
// pour GitHub, ou l'équivalent google.script.run pour Apps Script natif).
// Aucune logique de sécurité ici : tout est revérifié côté serveur (Code.gs).
// ===========================================================================

let SESSION = { token: null, nom: null, identifiant: null, qualite: null, role: null };
let STATE = {
  annee: null, annees: [], activites: [], vehicules: [], missions: [], assignations: [], qualifications: [],
  selectedVehicules: [], segments: [], segMode: 'intervalle', editingRow: null, detailMissionId: null
};

const MOIS_NOMS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const PANEL_TITLES = {
  'dashboard': 'Tableau de bord', 'mon-suivi': 'Mon suivi', 'activites': 'Activités PTA',
  'missions': 'Missions', 'vehicules': 'Véhicules', 'finances': 'Finances', 'comptes': 'Comptes',
  'validation': 'Validation', 'calendrier': 'Calendrier'
};

// ---------------------------------------------------------------------
// NAVIGATION
// ---------------------------------------------------------------------
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + btn.dataset.panel).classList.add('active');
    document.getElementById('topbar-title').textContent = PANEL_TITLES[btn.dataset.panel] || '';
    closeDropdowns();
    if (btn.dataset.panel === 'mon-suivi' && SESSION.token) loadMonSuivi();
    if (btn.dataset.panel === 'activites' && SESSION.token) renderActivitesPanel();
    if (btn.dataset.panel === 'comptes' && SESSION.token && SESSION.role === 'Administrateur') loadUsers();
    if (btn.dataset.panel === 'finances' && SESSION.token) loadFinances();
    if (btn.dataset.panel === 'calendrier' && SESSION.token) renderCalendrier();
    if (btn.dataset.panel === 'validation' && SESSION.token && SESSION.role === 'Administrateur') loadMissionsAValider();
  });
});

// ---------------------------------------------------------------------
// MENUS DÉROULANTS DE LA BARRE DU HAUT (lanceur de modules "9 points" + compte)
// ---------------------------------------------------------------------
function closeDropdowns() {
  document.getElementById('launcher-panel').classList.remove('open');
  document.getElementById('user-panel').classList.remove('open');
  document.getElementById('btn-launcher').classList.remove('open');
  document.getElementById('btn-user').classList.remove('open');
}
function toggleDropdown(panelId, btnId) {
  const panel = document.getElementById(panelId);
  const btn = document.getElementById(btnId);
  const willOpen = !panel.classList.contains('open');
  closeDropdowns();
  if (willOpen) { panel.classList.add('open'); btn.classList.add('open'); }
}
document.getElementById('btn-launcher').addEventListener('click', (e) => { e.stopPropagation(); toggleDropdown('launcher-panel', 'btn-launcher'); });
document.getElementById('btn-user').addEventListener('click', (e) => { e.stopPropagation(); toggleDropdown('user-panel', 'btn-user'); });
document.getElementById('launcher-panel').addEventListener('click', (e) => e.stopPropagation());
document.getElementById('user-panel').addEventListener('click', (e) => e.stopPropagation());
document.addEventListener('click', closeDropdowns);

document.getElementById('sel-annee').addEventListener('change', () => {
  STATE.annee = document.getElementById('sel-annee').value;
  loadDashboard();
  if (SESSION.token) {
    loadInitialData();
    loadMonSuivi();
    if (SESSION.role === 'Comptable' || SESSION.role === 'Administrateur') loadFinances();
    if (SESSION.role === 'Gestionnaire Parc' || SESSION.role === 'Administrateur') loadDashboardParcAuto();
    if (SESSION.role === 'Administrateur') loadMissionsAValider();
  }
});

function populateMonthSelects() {
  ['export-mois-debut', 'export-mois-fin'].forEach((id, idx) => {
    const sel = document.getElementById(id);
    sel.innerHTML = MOIS_NOMS.map((m, i) => `<option value="${i + 1}" ${i === (idx === 0 ? 0 : 11) ? 'selected' : ''}>${m}</option>`).join('');
  });
}

function init() {
  populateMonthSelects();
  updateRestrictedNav();
  api('getAnnees', []).then(annees => {
    STATE.annees = annees.length ? annees : [2026];
    STATE.annee = STATE.annees[STATE.annees.length - 1];
    const sel = document.getElementById('sel-annee');
    sel.innerHTML = STATE.annees.map(a => `<option value="${a}" ${a == STATE.annee ? 'selected' : ''}>${a}</option>`).join('');
    document.getElementById('pta-annee-source').innerHTML = STATE.annees.map(a => `<option value="${a}">${a}</option>`).join('');
    loadDashboard();
  }).catch(() => { STATE.annee = 2026; loadDashboard(); });
}

// ---------------------------------------------------------------------
// CONNEXION / DECONNEXION
// ---------------------------------------------------------------------
document.getElementById('btn-open-login-global').addEventListener('click', () => {
  closeDropdowns();
  document.getElementById('login-modal-overlay').style.display = 'flex';
  document.getElementById('login-id-global').focus();
});
document.getElementById('btn-close-login-global').addEventListener('click', () => {
  document.getElementById('login-modal-overlay').style.display = 'none';
});
document.getElementById('login-modal-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'login-modal-overlay') document.getElementById('login-modal-overlay').style.display = 'none';
});
document.getElementById('btn-login-global').addEventListener('click', () => doLogin('login-id-global', 'login-pw-global', 'login-alert-global'));
['login-id-global', 'login-pw-global'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('btn-login-global').click(); });
});

document.getElementById('btn-login-m').addEventListener('click', () => doLogin('login-id-m', 'login-pw-m', 'login-alert-missions'));
document.getElementById('btn-login-v').addEventListener('click', () => doLogin('login-id-v', 'login-pw-v', 'login-alert-vehicules'));
document.getElementById('btn-login-s').addEventListener('click', () => doLogin('login-id-s', 'login-pw-s', 'login-alert-suivi'));
document.getElementById('btn-login-a').addEventListener('click', () => doLogin('login-id-a', 'login-pw-a', 'login-alert-activites'));
document.getElementById('btn-login-f').addEventListener('click', () => doLogin('login-id-f', 'login-pw-f', 'login-alert-finances'));
document.getElementById('btn-login-val').addEventListener('click', () => doLogin('login-id-val', 'login-pw-val', 'login-alert-validation'));
document.getElementById('btn-login-cal').addEventListener('click', () => doLogin('login-id-cal', 'login-pw-cal', 'login-alert-calendrier'));
document.getElementById('btn-login-c').addEventListener('click', () => doLogin('login-id-c', 'login-pw-c', 'login-alert-comptes'));

function doLogin(idFieldId, pwFieldId, alertId) {
  const identifiant = document.getElementById(idFieldId).value.trim();
  const motDePasse = document.getElementById(pwFieldId).value;
  if (!identifiant || !motDePasse) { showAlert(alertId, 'error', 'Merci de renseigner votre identifiant et votre mot de passe.'); return; }
  api('login', [identifiant, motDePasse]).then(res => onLoginResult(res, alertId)).catch(err => showAlert(alertId, 'error', 'Erreur : ' + (err.message || err)));
}

// Vide TOUS les champs identifiant/mot de passe de l'application (le formulaire
// global du modal + le formulaire de chaque module). Sans cela, l'identifiant et
// le mot de passe saisis restaient affichés dans les champs des autres modules
// même après connexion/déconnexion, exposant les identifiants d'un utilisateur
// à la personne suivante sur le même appareil.
function clearAllLoginFields() {
  ['global', 'm', 'v', 's', 'a', 'f', 'val', 'cal', 'c'].forEach(suffix => {
    const idField = document.getElementById('login-id-' + suffix);
    const pwField = document.getElementById('login-pw-' + suffix);
    if (idField) idField.value = '';
    if (pwField) pwField.value = '';
  });
}

// Affiche la photo de profil (ou, à défaut, les initiales du nom) sur le petit
// avatar de la barre du haut et sur le grand avatar du menu Compte.
function renderAvatar(url, nom) {
  const initiales = (nom || '').trim().split(/\s+/).slice(0, 2).map(s => s[0] || '').join('') || '?';
  [document.getElementById('user-avatar'), document.getElementById('user-avatar-lg')].forEach(el => {
    if (!el) return;
    if (url) { el.style.backgroundImage = `url("${url}")`; el.textContent = ''; }
    else { el.style.backgroundImage = 'none'; el.textContent = initiales; }
  });
}

document.getElementById('btn-change-avatar').addEventListener('click', () => document.getElementById('avatar-file-input').click());
document.getElementById('avatar-file-input').addEventListener('change', (e) => {
  const fichier = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!fichier) return;
  if (!fichier.type.startsWith('image/')) { alert('Merci de choisir un fichier image.'); return; }
  redimensionnerImage_(fichier, 256).then(dataUrl => {
    api('updateAvatar', [SESSION.token, dataUrl]).then(res => {
      if (!res.success) { alert(res.error || "Erreur lors de l'enregistrement de la photo."); return; }
      SESSION.avatarUrl = res.avatarUrl;
      renderAvatar(SESSION.avatarUrl, SESSION.nom);
    }).catch(err => alert('Erreur : ' + (err.message || err)));
  }).catch(() => alert("Impossible de lire cette image."));
});

/** Redimensionne et compresse une image côté navigateur (via <canvas>) avant envoi,
 *  pour que la photo de profil reste légère à transmettre et à stocker. */
function redimensionnerImage_(fichier, tailleMax) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const ratio = Math.min(1, tailleMax / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(fichier);
  });
}

function onLoginResult(res, alertId) {
  if (!res.success) { showAlert(alertId, 'error', res.error || 'Connexion refusée.'); return; }
  SESSION = { token: res.token, nom: res.nom, identifiant: res.identifiant, qualite: res.qualite, role: res.role, avatarUrl: res.avatarUrl || '' };

  document.getElementById('session-block').style.display = 'block';
  document.getElementById('session-chip').textContent = res.qualite ? `${res.nom} (${res.qualite})` : res.nom;
  document.getElementById('session-role').textContent = res.role;
  renderAvatar(SESSION.avatarUrl, res.nom);

  document.getElementById('login-modal-overlay').style.display = 'none';
  clearAllLoginFields();
  document.getElementById('btn-open-login-global').style.display = 'none';
  const chip = document.getElementById('topbar-session-chip');
  chip.style.display = 'inline';
  chip.textContent = `${res.nom} · ${res.role}`;

  ['missions', 'vehicules', 'mon-suivi', 'activites', 'finances', 'comptes', 'calendrier', 'validation'].forEach(p => {
    const gate = document.getElementById(p + '-gate');
    const content = document.getElementById(p + '-content');
    if (gate) gate.style.display = 'none';
    if (content) content.style.display = 'block';
  });

  updateVehiculeAccess();
  updateRestrictedNav();

  if (SESSION.role !== 'Consultation') loadInitialData();
  loadMonSuivi();
  if (SESSION.role === 'Administrateur') loadUsers();
  if (SESSION.role === 'Comptable' || SESSION.role === 'Administrateur') loadFinances();
  if (SESSION.role === 'Gestionnaire Parc' || SESSION.role === 'Administrateur') loadDashboardParcAuto();
  if (SESSION.role === 'Administrateur') loadMissionsAValider();
}

function loadMissionsAValider() {
  api('getMissionsAValider', [SESSION.token]).then(renderMissionsAValider).catch(() => {});
}

function renderMissionsAValider(missions) {
  const badge = document.getElementById('validation-count-badge');
  if (badge) {
    badge.textContent = missions.length;
    badge.className = 'badge ' + (missions.length ? 'badge-warn' : 'badge-ok');
  }
  const wrap = document.getElementById('validation-table-wrap');
  if (!wrap) return;
  wrap.innerHTML = missions.length === 0 ? '<div class="empty">Aucune mission en attente de validation.</div>' : `<table><thead><tr><th>ID</th><th class="col-libelle">Intitulé</th><th>Année</th><th>Saisi par</th><th>Coût</th><th></th></tr></thead><tbody>
      ${missions.map(m => `<tr><td>${escapeHtml(m.id)}</td><td class="col-libelle">${escapeHtml(m.intitule)}</td><td>${escapeHtml(String(m.annee || ''))}</td><td>${escapeHtml(m.saisiPar || '—')}</td><td>${fmtMilliers(m.cout)}</td>
        <td><button class="btn btn-primary btn-sm" onclick="validerMissionDepuisDashboard(${m.row})">Valider</button> <button class="btn btn-secondary btn-sm" onclick="openDetail('${escapeAttr(m.id)}')">Détail</button></td></tr>`).join('')}
    </tbody></table>`;
}

function validerMissionDepuisDashboard(row) {
  api('validerMission', [SESSION.token, row]).then(res => {
    if (!res.success) { alert(res.error || 'Erreur.'); return; }
    loadMissionsAValider();
    loadInitialData();
  }).catch(onSessionError);
}

function loadDashboardParcAuto() {
  api('getDashboardParcAuto', [SESSION.token]).then(renderDashboardParcAuto).catch(() => {});
}

function renderDashboardParcAuto(d) {
  let el = document.getElementById('dashboard-parc-auto');
  if (!el) {
    el = document.createElement('div');
    el.id = 'dashboard-parc-auto';
    document.getElementById('dashboard-content').appendChild(el);
  }
  if (!d.vehicules.length) { el.innerHTML = '<div class="card"><h2>Parc automobile — sollicitations</h2><div class="empty">Aucun véhicule enregistré.</div></div>'; return; }
  el.innerHTML = `<div class="card">
    <h2>Parc automobile — sollicitations prochaines et évolution (${d.annee})</h2>
    ${d.vehicules.map(v => {
      const maxMois = Math.max(1, ...v.sollicitationsParMois);
      const barres = v.sollicitationsParMois.map((n, i) => `<div class="col">
        <div class="val">${n}</div>
        <div class="bar" style="height:${Math.max(2, Math.round(100 * n / maxMois))}%;"></div>
        <div class="lbl">${MOIS_NOMS[i].slice(0, 3)}</div>
      </div>`).join('');
      return `<div class="activite-card">
        <div class="titre">${escapeHtml(v.immat)} ${v.modele ? '— ' + escapeHtml(v.modele) : ''} <span class="badge ${v.statut === 'Disponible' ? 'badge-dispo' : 'badge-occupe'}" style="margin-left:8px;">${escapeHtml(v.statut)}</span></div>
        <h3 style="margin-top:10px;">Prochaines sollicitations</h3>
        ${v.prochaines.length === 0 ? '<div class="empty" style="padding:10px;">Aucune sollicitation à venir.</div>' : `<table><thead><tr><th>ID</th><th class="col-libelle">Mission</th><th>Jours</th><th>Responsable</th></tr></thead><tbody>
          ${v.prochaines.slice(0, 6).map(m => `<tr><td>${escapeHtml(m.id)}</td><td class="col-libelle">${escapeHtml(m.intitule)}</td><td>${escapeHtml(m.joursEngages)}</td><td>${escapeHtml(m.saisiPar || '—')}</td></tr>`).join('')}
        </tbody></table>`}
        <h3>Évolution des sollicitations (${d.annee})</h3>
        <div class="mini-bar-chart">${barres}</div>
      </div>`;
    }).join('')}
  </div>`;
}

document.getElementById('btn-mon-compte').addEventListener('click', () => {
  closeDropdowns();
  document.getElementById('mc-pw-actuel').value = '';
  document.getElementById('mc-nouvel-id').value = '';
  document.getElementById('mc-nouveau-pw').value = '';
  document.getElementById('mon-compte-alert').innerHTML = '';
  document.getElementById('mon-compte-overlay').style.display = 'flex';
});
document.getElementById('btn-close-mon-compte').addEventListener('click', () => {
  document.getElementById('mon-compte-overlay').style.display = 'none';
});
document.getElementById('mon-compte-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'mon-compte-overlay') document.getElementById('mon-compte-overlay').style.display = 'none';
});
document.getElementById('btn-save-mon-compte').addEventListener('click', () => {
  const data = {
    motDePasseActuel: document.getElementById('mc-pw-actuel').value,
    nouvelIdentifiant: document.getElementById('mc-nouvel-id').value.trim(),
    nouveauMotDePasse: document.getElementById('mc-nouveau-pw').value
  };
  if (!data.motDePasseActuel) { showAlert('mon-compte-alert', 'error', 'Merci de saisir votre mot de passe actuel.'); return; }
  if (!data.nouvelIdentifiant && !data.nouveauMotDePasse) { showAlert('mon-compte-alert', 'error', "Renseignez au moins un nouvel identifiant ou un nouveau mot de passe."); return; }
  api('updateMesIdentifiants', [SESSION.token, data]).then(res => {
    if (!res.success) { showAlert('mon-compte-alert', 'error', res.error || 'Erreur.'); return; }
    showAlert('mon-compte-alert', 'success', '✅ Mis à jour. Merci de vous reconnecter avec vos nouveaux identifiants.');
    setTimeout(() => { document.getElementById('mon-compte-overlay').style.display = 'none'; document.getElementById('btn-logout').click(); }, 1200);
  }).catch(err => showAlert('mon-compte-alert', 'error', 'Erreur : ' + (err.message || err)));
});

document.getElementById('btn-logout').addEventListener('click', () => {
  if (SESSION.token) api('logout', [SESSION.token]).catch(() => {});
  SESSION = { token: null, nom: null, identifiant: null, qualite: null, role: null, avatarUrl: '' };
  document.getElementById('session-block').style.display = 'none';
  document.getElementById('btn-open-login-global').style.display = 'inline-block';
  document.getElementById('topbar-session-chip').style.display = 'none';
  renderAvatar('', '');
  ['missions', 'vehicules', 'mon-suivi', 'activites', 'finances', 'comptes', 'calendrier', 'validation'].forEach(p => {
    const gate = document.getElementById(p + '-gate');
    const content = document.getElementById(p + '-content');
    if (gate) gate.style.display = 'block';
    if (content) content.style.display = 'none';
  });
  clearAllLoginFields();
  updateRestrictedNav();
  document.querySelector('.nav-btn[data-panel="dashboard"]').click();
});

function updateVehiculeAccess() {
  const canManage = SESSION.role === 'Gestionnaire Parc' || SESSION.role === 'Administrateur';
  document.getElementById('add-vehicule-card').style.display = canManage ? 'block' : 'none';
  document.getElementById('vehicule-restricted-note').style.display = canManage ? 'none' : 'block';
  const peutGererMissions = SESSION.role === "Responsable d'activité" || SESSION.role === 'Administrateur';
  document.getElementById('btn-new-hors-pta').style.display = peutGererMissions ? 'inline-block' : 'none';
}

function updateRestrictedNav() {
  const loggedIn = !!SESSION.token;
  const isFinanceRole = SESSION.role === 'Comptable' || SESSION.role === 'Administrateur';
  const isAdmin = SESSION.role === 'Administrateur';
  const canHaveActivites = SESSION.role === "Responsable d'activité" || isAdmin;
  const canSeeVehicules = SESSION.role === 'Gestionnaire Parc' || isAdmin;
  document.querySelector('.nav-btn[data-panel="missions"]').style.display = loggedIn ? 'flex' : 'none';
  document.querySelector('.nav-btn[data-panel="mon-suivi"]').style.display = loggedIn ? 'flex' : 'none';
  document.querySelector('.nav-btn[data-panel="calendrier"]').style.display = (loggedIn && SESSION.role !== 'Consultation') ? 'flex' : 'none';
  document.querySelector('.nav-btn[data-panel="activites"]').style.display = (loggedIn && canHaveActivites) ? 'flex' : 'none';
  document.querySelector('.nav-btn[data-panel="vehicules"]').style.display = (loggedIn && canSeeVehicules) ? 'flex' : 'none';
  document.querySelector('.nav-btn[data-panel="finances"]').style.display = (loggedIn && isFinanceRole) ? 'flex' : 'none';
  document.querySelector('.nav-btn[data-panel="validation"]').style.display = (loggedIn && isAdmin) ? 'flex' : 'none';
  document.querySelector('.nav-btn[data-panel="comptes"]').style.display = (loggedIn && isAdmin) ? 'flex' : 'none';
  document.getElementById('admin-pta-card').style.display = isAdmin ? 'block' : 'none';
  document.getElementById('annee-selector').style.display = isAdmin ? 'flex' : 'none';
}

function onSessionError(err) {
  const msg = (err && err.message) || String(err);
  if (msg.indexOf('SESSION_EXPIREE') !== -1) { alert('Votre session a expiré, merci de vous reconnecter.'); document.getElementById('btn-logout').click(); }
  else if (msg.indexOf('ACCES_REFUSE_PROPRIETAIRE') !== -1) showAlert('form-alert', 'error', "Cette mission a déjà été saisie par quelqu'un d'autre : seul son auteur ou un compte Administrateur peut la modifier.");
  else if (msg.indexOf('ACTIVITE_NON_ASSIGNEE') !== -1) showAlert('form-alert', 'error', "Vous devez d'abord prendre en charge cette activité PTA depuis l'onglet \"Activités PTA\" avant d'y saisir une mission.");
  else if (msg.indexOf('ACCES_REFUSE_ACTIVITE') !== -1) showAlert('form-alert', 'error', "Cette activité est prise en charge par quelqu'un d'autre : seul son responsable ou un compte Administrateur peut la modifier.");
  else if (msg.indexOf('ACCES_REFUSE') !== -1) alert("Votre compte n'a pas les droits nécessaires pour cette action.");
  else alert('Erreur : ' + msg);
}

// ---------------------------------------------------------------------
// CHARGEMENT DES DONNEES (connecté)
// ---------------------------------------------------------------------
function loadInitialData() {
  api('getInitialData', [SESSION.token, STATE.annee]).then(onInitialData).catch(onSessionError);
}

function onInitialData(data) {
  STATE.activites = data.activites;
  STATE.vehicules = data.vehicules;
  STATE.missions = data.missions;
  STATE.assignations = data.assignations;
  STATE.qualifications = data.qualifications;
  renderActiviteSelect();
  renderVehiculeChips();
  renderMissionsTable();
  renderVehiculesTable();
  if (document.getElementById('panel-activites').classList.contains('active')) renderActivitesPanel();
}

function mesActiviteN_() {
  if (SESSION.role === 'Administrateur') return STATE.activites.map(a => String(a.n));
  return STATE.assignations.filter(a => a.identifiant.toLowerCase() === (SESSION.identifiant || '').toLowerCase()).map(a => String(a.activiteN));
}

function renderActiviteSelect() {
  const sel = document.getElementById('f-activite');
  const mien = mesActiviteN_();
  const activites = STATE.activites.filter(a => mien.includes(String(a.n)));
  sel.innerHTML = '<option value="">— Aucune (mission hors PTA) —</option>' +
    activites.map(a => `<option value="${a.n}">N°${a.n} - ${escapeHtml(truncate(a.intitule, 65))}</option>`).join('');
  if (activites.length === 0) {
    sel.innerHTML += '';
  }
}

function renderVehiculeChips() {
  const wrap = document.getElementById('f-vehicules-chips');
  if (STATE.vehicules.length === 0) { wrap.innerHTML = '<span style="color:#888;font-size:12.5px;">Aucun véhicule enregistré.</span>'; return; }
  wrap.innerHTML = STATE.vehicules.map(v =>
    `<div class="chip ${STATE.selectedVehicules.includes(v.immat) ? 'selected' : ''}" data-immat="${escapeAttr(v.immat)}">${escapeHtml(v.immat)} ${v.statut === 'Hors service' ? '🚫' : ''}</div>`).join('');
  wrap.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const immat = chip.dataset.immat;
      STATE.selectedVehicules = STATE.selectedVehicules.includes(immat) ? STATE.selectedVehicules.filter(x => x !== immat) : [...STATE.selectedVehicules, immat];
      renderVehiculeChips();
    });
  });
}

// ---------------------------------------------------------------------
// ACTIVITES PTA — auto-assignation
// ---------------------------------------------------------------------
document.getElementById('search-activites').addEventListener('input', () => renderActivitesPanel());

function renderActivitesPanel() {
  const wrap = document.getElementById('activites-list-wrap');
  const search = document.getElementById('search-activites').value.toLowerCase();
  let activites = STATE.activites;
  if (search) activites = activites.filter(a => (a.intitule || '').toLowerCase().includes(search));
  if (activites.length === 0) { wrap.innerHTML = '<div class="empty">Aucune activité pour cette année / recherche.</div>'; return; }

  wrap.innerHTML = activites.map(a => {
    const assignation = STATE.assignations.find(x => String(x.activiteN) === String(a.n));
    const estMoi = assignation && assignation.identifiant.toLowerCase() === (SESSION.identifiant || '').toLowerCase();
    const peutPrendre = !assignation && (SESSION.role === "Responsable d'activité" || SESSION.role === 'Administrateur');
    let statutHtml;
    if (assignation) statutHtml = `<span class="badge badge-prise">Pris en charge — ${escapeHtml(assignation.nomAffiche)}</span><span class="qualif-tag">${escapeHtml(assignation.qualification)}</span>`;
    else statutHtml = `<span class="badge badge-libre">Libre</span>`;
    let actionHtml = '';
    if (peutPrendre) actionHtml = `<button class="btn btn-accent btn-sm" onclick="openClaimForm(${a.n})">Prendre en charge</button>`;
    else if (estMoi) actionHtml = `<button class="btn btn-secondary btn-sm" onclick="openClaimForm(${a.n})">Changer ma qualification</button>`;
    else if (assignation && SESSION.role === 'Administrateur') actionHtml = `<button class="btn btn-secondary btn-sm" onclick="retirerAssignation(${a.n})">Retirer l'assignation</button> <button class="btn btn-secondary btn-sm" onclick="openReassignForm(${a.n})">Réaffecter à...</button>`;
    if (!assignation && SESSION.role === 'Administrateur') actionHtml += ` <button class="btn btn-secondary btn-sm" onclick="openReassignForm(${a.n})">Assigner à...</button>`;
    return `<div class="activite-card">
      <div class="titre">N°${escapeHtml(String(a.n))} - ${escapeHtml(a.intitule)}</div>
      <div style="font-size:12px;color:var(--gris);margin-bottom:8px;">${escapeHtml(a.structureResp || '')} · Budget : ${escapeHtml(String(a.coutTotal || 0))} milliers FCFA</div>
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <div>${statutHtml}</div>
        <div id="claim-action-${a.n}">${actionHtml}</div>
      </div>
      <div id="claim-form-${a.n}" style="display:none; margin-top:10px;"></div>
    </div>`;
  }).join('');
}

function openClaimForm(activiteN) {
  const wrap = document.getElementById('claim-form-' + activiteN);
  const quals = STATE.qualifications || [];
  wrap.style.display = 'block';
  wrap.innerHTML = `
    <div class="qualif-select-wrap">
      <select id="claim-qual-select-${activiteN}">
        <option value="">— Choisir une qualification —</option>
        ${quals.map(q => `<option value="${escapeAttr(q)}">${escapeHtml(q)}</option>`).join('')}
        <option value="__autre__">Autre (préciser)...</option>
      </select>
      <input id="claim-qual-custom-${activiteN}" placeholder="Qualification..." style="display:none;">
      <button class="btn btn-primary btn-sm" onclick="confirmClaim(${activiteN})">Confirmer</button>
      <button class="btn btn-secondary btn-sm" onclick="document.getElementById('claim-form-${activiteN}').style.display='none';">Annuler</button>
    </div>`;
  document.getElementById(`claim-qual-select-${activiteN}`).addEventListener('change', function () {
    document.getElementById(`claim-qual-custom-${activiteN}`).style.display = this.value === '__autre__' ? 'block' : 'none';
  });
}

function confirmClaim(activiteN) {
  const sel = document.getElementById(`claim-qual-select-${activiteN}`);
  let qualification = sel.value;
  if (qualification === '__autre__') qualification = document.getElementById(`claim-qual-custom-${activiteN}`).value.trim();
  if (!qualification) { alert('Merci de choisir ou saisir une qualification.'); return; }
  api('assignerActivite', [SESSION.token, STATE.annee, activiteN, qualification]).then(res => {
    if (!res.success) { alert(res.error || 'Erreur.'); return; }
    loadInitialData();
  }).catch(onSessionError);
}

function retirerAssignation(activiteN) {
  if (!confirm('Retirer cette assignation ? L\'activité redeviendra libre.')) return;
  api('retirerAssignation', [SESSION.token, STATE.annee, activiteN]).then(res => {
    if (!res.success) { alert(res.error || 'Erreur.'); return; }
    loadInitialData();
  }).catch(onSessionError);
}

function openReassignForm(activiteN) {
  const wrap = document.getElementById('claim-form-' + activiteN);
  wrap.style.display = 'block';
  const renderForm = () => {
    const quals = STATE.qualifications || [];
    wrap.innerHTML = `
      <div class="qualif-select-wrap">
        <select id="reassign-user-${activiteN}">
          <option value="">— Choisir un utilisateur —</option>
          ${(STATE.users || []).filter(u => u.role === "Responsable d'activité").map(u => `<option value="${escapeAttr(u.identifiant)}">${escapeHtml(u.nom)} (${escapeHtml(u.identifiant)})</option>`).join('')}
        </select>
        <select id="reassign-qual-${activiteN}">
          <option value="">— Qualification —</option>
          ${quals.map(q => `<option value="${escapeAttr(q)}">${escapeHtml(q)}</option>`).join('')}
        </select>
        <button class="btn btn-primary btn-sm" onclick="confirmReassign(${activiteN})">Confirmer</button>
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('claim-form-${activiteN}').style.display='none';">Annuler</button>
      </div>`;
  };
  if (STATE.users && STATE.users.length) renderForm();
  else api('listUsers', [SESSION.token]).then(users => { STATE.users = users; renderForm(); }).catch(onSessionError);
}

function confirmReassign(activiteN) {
  const identifiant = document.getElementById(`reassign-user-${activiteN}`).value;
  const qualification = document.getElementById(`reassign-qual-${activiteN}`).value;
  if (!identifiant) { alert('Merci de choisir un utilisateur.'); return; }
  api('reassignerActivite', [SESSION.token, STATE.annee, activiteN, identifiant, qualification]).then(res => {
    if (!res.success) { alert(res.error || 'Erreur.'); return; }
    loadInitialData();
  }).catch(onSessionError);
}

// ---- Gestion admin des années PTA ----
document.getElementById('btn-dupliquer-annee').addEventListener('click', () => {
  const src = document.getElementById('pta-annee-source').value;
  const cible = document.getElementById('pta-annee-cible').value;
  if (!cible) { showAlert('pta-admin-alert', 'error', "Précisez l'année cible."); return; }
  api('dupliquerAnneePTA', [SESSION.token, src, cible]).then(res => {
    if (!res.success) { showAlert('pta-admin-alert', 'error', res.error || 'Erreur.'); return; }
    showAlert('pta-admin-alert', 'success', `✅ ${res.count} activité(s) dupliquée(s) vers ${cible}.`);
    api('getAnnees', []).then(annees => {
      STATE.annees = annees;
      document.getElementById('sel-annee').innerHTML = STATE.annees.map(a => `<option value="${a}">${a}</option>`).join('');
      document.getElementById('pta-annee-source').innerHTML = STATE.annees.map(a => `<option value="${a}">${a}</option>`).join('');
    });
  }).catch(onSessionError);
});

document.getElementById('btn-add-activite').addEventListener('click', () => {
  const data = {
    n: document.getElementById('pta-n').value, intitule: document.getElementById('pta-intitule').value.trim(),
    structureResp: document.getElementById('pta-struct-resp').value.trim(), coutTotal: document.getElementById('pta-cout').value,
    annee: STATE.annee
  };
  if (!data.n || !data.intitule) { showAlert('pta-admin-alert', 'error', 'N° et intitulé sont obligatoires.'); return; }
  api('addActivitePTA', [SESSION.token, data]).then(res => {
    if (!res.success) { showAlert('pta-admin-alert', 'error', res.error || 'Erreur.'); return; }
    showAlert('pta-admin-alert', 'success', '✅ Activité ajoutée.');
    ['pta-n','pta-intitule','pta-struct-resp','pta-cout'].forEach(id => document.getElementById(id).value = '');
    loadInitialData();
  }).catch(onSessionError);
});

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
  document.getElementById('nb-jours').textContent = STATE.segments.length ? `Total : ${nbJours} jour${nbJours > 1 ? 's' : ''} réservé${nbJours > 1 ? 's' : ''}.` : '';
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
function segmentsToText(segments) { return segments.map(s => s.type === 'intervalle' ? `${fmtISOtoDMY(s.debut)}-${fmtISOtoDMY(s.fin)}` : fmtISOtoDMY(s.debut)).join(', '); }
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
// CALENDRIER (façon Google Agenda, lecture des missions déjà chargées)
// ---------------------------------------------------------------------
let CAL_DATE = new Date();
document.getElementById('btn-cal-prev').addEventListener('click', () => { CAL_DATE.setMonth(CAL_DATE.getMonth() - 1); renderCalendrier(); });
document.getElementById('btn-cal-next').addEventListener('click', () => { CAL_DATE.setMonth(CAL_DATE.getMonth() + 1); renderCalendrier(); });

function renderCalendrier() {
  if (!STATE.missions || !STATE.missions.length) { api('getInitialData', [SESSION.token, STATE.annee]).then(d => { onInitialData(d); drawCalendrier(); }).catch(onSessionError); return; }
  drawCalendrier();
}

function drawCalendrier() {
  const label = document.getElementById('cal-mois-label');
  label.textContent = MOIS_NOMS[CAL_DATE.getMonth()] + ' ' + CAL_DATE.getFullYear();

  const year = CAL_DATE.getFullYear(), month = CAL_DATE.getMonth();
  const premierJour = new Date(year, month, 1);
  const decalage = (premierJour.getDay() + 6) % 7; // Lundi = 0
  const nbJours = new Date(year, month + 1, 0).getDate();

  const missionsParJour = {};
  STATE.missions.forEach(m => {
    (m.joursDatesISO || []).forEach(iso => {
      if (!missionsParJour[iso]) missionsParJour[iso] = [];
      missionsParJour[iso].push(m);
    });
  });

  const joursLbl = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
  let html = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;">';
  html += joursLbl.map(j => `<div style="font-size:10.5px;font-weight:700;color:var(--gris);text-align:center;padding:4px 0;">${j}</div>`).join('');
  for (let i = 0; i < decalage; i++) html += '<div></div>';
  const todayISO = new Date().toISOString().slice(0, 10);
  for (let d = 1; d <= nbJours; d++) {
    const iso = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const missionsJour = missionsParJour[iso] || [];
    const estAujourdhui = iso === todayISO;
    const chip = (m) => {
      let bg = '#fbe9e7', fg = 'var(--rouge)'; // rouge par défaut : période passée, non validée
      if (m.statutValidation === 'Validée') { bg = '#e2f2ec'; fg = 'var(--vert)'; }
      else if (iso >= todayISO) { bg = '#fdf1e2'; fg = 'var(--orange)'; } // jaune/orange : période pas encore passée
      return `<div title="${escapeAttr(m.intitule)}${m.saisiPar ? ' — ' + escapeAttr(m.saisiPar) : ''}" style="font-size:9.5px;background:${bg};color:${fg};border-radius:4px;padding:1px 4px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:help;">${escapeHtml(truncate(m.intitule, 16))}</div>`;
    };
    html += `<div onclick="showCalJour('${iso}')" style="min-height:64px;border:1px solid var(--bord);border-radius:8px;padding:6px;cursor:pointer;background:${estAujourdhui ? '#fdf1e2' : '#fff'};">
      <div style="font-size:11.5px;font-weight:700;color:${estAujourdhui ? 'var(--accent-dark)' : 'var(--navy)'};">${d}</div>
      ${missionsJour.slice(0, 2).map(chip).join('')}
      ${missionsJour.length > 2 ? `<div style="font-size:9.5px;color:var(--gris);margin-top:2px;">+${missionsJour.length - 2} autre(s)</div>` : ''}
    </div>`;
  }
  html += '</div>';
  html += `<div style="font-size:11px;color:var(--gris);margin-top:10px;">
    <span style="color:var(--vert);font-weight:700;">■</span> Validée &nbsp;
    <span style="color:var(--orange);font-weight:700;">■</span> À venir / non encore validée &nbsp;
    <span style="color:var(--rouge);font-weight:700;">■</span> Période passée, non validée
  </div>`;
  document.getElementById('calendrier-grid').innerHTML = html;
  window._missionsParJourCal = missionsParJour;
}

function showCalJour(iso) {
  const missions = (window._missionsParJourCal || {})[iso] || [];
  document.getElementById('cal-jour-title').textContent = 'Missions du ' + fmtISOtoDMY(iso);
  const wrap = document.getElementById('cal-jour-detail');
  if (missions.length === 0) { wrap.innerHTML = '<div class="empty">Aucune mission ce jour-là.</div>'; return; }
  wrap.innerHTML = `<table><thead><tr><th>ID</th><th>Intitulé</th><th>Véhicule(s) / Moyen</th><th>Responsable</th><th>Statut</th></tr></thead><tbody>
    ${missions.map(m => {
      const veh = (m.vehicules && m.vehicules.length) ? m.vehicules.join(', ') : (m.moyenHorsFlotte || '—');
      return `<tr><td>${escapeHtml(m.id)}</td><td>${escapeHtml(m.intitule)}</td><td>${escapeHtml(veh)}</td><td>${escapeHtml(m.saisiPar || '—')}</td><td>${escapeHtml(m.statut)}</td></tr>`;
    }).join('')}</tbody></table>`;
}

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
  if (!intitule || joursDates.length === 0) { showAlert('form-alert', 'error', "Merci de renseigner l'intitulé et au moins une période."); return; }

  const activiteReadonly = document.getElementById('wrap-activite-readonly').style.display !== 'none';
  const data = {
    activiteN: activiteReadonly ? undefined : document.getElementById('f-activite').value,
    annee: STATE.annee, intitule: intitule, joursEngages: joursEngages, vehicules: vehiculesList.join(', '),
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
        const list = res.conflicts.map(c => `<li><b>${escapeHtml(c.id)}</b> - ${escapeHtml(c.intitule)}, véhicule(s) : ${escapeHtml(c.vehicules.join(', '))} — jour(s) commun(s) : ${escapeHtml(c.joursCommuns.join(', '))}</li>`).join('');
        showAlert('form-alert', 'error', `⚠️ Conflit détecté :<ul style="margin:6px 0 0 18px;">${list}</ul>`);
      } else showAlert('form-alert', 'error', res.error || "Erreur lors de l'enregistrement.");
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
    if (parts.length === 1) jours.add(parts[0]);
    else if (parts.length === 2) { let cur = new Date(dmyToISO(parts[0])), fin = new Date(dmyToISO(parts[1])); while (cur <= fin) { jours.add(cur.toISOString().slice(0, 10)); cur.setDate(cur.getDate() + 1); } }
  });
  return Array.from(jours);
}

function clearAlert() { document.getElementById('form-alert').innerHTML = ''; }
function showAlert(id, type, html) { const el = document.getElementById(id); if (el) el.innerHTML = `<div class="alert alert-${type}">${html}</div>`; }

// ---------------------------------------------------------------------
// DUPLICATION / VALIDATION / DETAIL
// ---------------------------------------------------------------------
function dupliquerMission(row) { api('dupliquerMission', [SESSION.token, row]).then(res => { if (!res.success) { alert(res.error || 'Erreur.'); return; } loadInitialData(); }).catch(onSessionError); }
function validerMission(row) { api('validerMission', [SESSION.token, row]).then(res => { if (!res.success) { alert(res.error || 'Erreur.'); return; } loadInitialData(); }).catch(onSessionError); }

function openDetail(missionId) {
  document.getElementById('edit-card').style.display = 'none';
  document.getElementById('detail-card').style.display = 'block';
  document.getElementById('detail-title').textContent = 'Détails de la mission ' + missionId;
  STATE.detailMissionId = missionId;
  loadCommentaires(); loadHistorique();
  document.getElementById('detail-card').scrollIntoView({ behavior: 'smooth' });
}
document.getElementById('btn-close-detail').addEventListener('click', () => { document.getElementById('detail-card').style.display = 'none'; });

function loadCommentaires() {
  api('getCommentaires', [SESSION.token, STATE.detailMissionId]).then(list => {
    document.getElementById('commentaires-list').innerHTML = list.length ? list.map(c => `<div class="comment-item"><div class="meta">${escapeHtml(c.nomAffiche)} · ${escapeHtml(c.date)}</div>${escapeHtml(c.texte)}</div>`).join('') : '<div class="empty">Aucun commentaire.</div>';
  }).catch(onSessionError);
}
document.getElementById('btn-add-commentaire').addEventListener('click', () => {
  const texte = document.getElementById('new-commentaire').value.trim();
  if (!texte) return;
  api('addCommentaire', [SESSION.token, STATE.detailMissionId, texte]).then(res => { if (res.success) { document.getElementById('new-commentaire').value = ''; loadCommentaires(); } }).catch(onSessionError);
});
function loadHistorique() {
  api('getHistorique', [SESSION.token, STATE.detailMissionId]).then(list => {
    document.getElementById('historique-list').innerHTML = list.length ? list.map(h => `<div class="hist-item">${escapeHtml(h.date)} — <b>${escapeHtml(h.action)}</b> par ${escapeHtml(h.nomAffiche)} ${h.detail ? '(' + escapeHtml(h.detail) + ')' : ''}</div>`).join('') : '<div class="empty">Aucun historique.</div>';
  }).catch(onSessionError);
}

// ---------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------
function downloadCSV(res) {
  if (!res.success) { alert(res.error || 'Erreur export.'); return; }
  const blob = new Blob(["\uFEFF" + res.csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = res.filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}
document.getElementById('btn-export-csv').addEventListener('click', () => api('exportMissionsCSV', [SESSION.token, STATE.annee]).then(downloadCSV).catch(onSessionError));
document.getElementById('btn-export-programmation').addEventListener('click', () => {
  const filtres = { annee: STATE.annee, moisDebut: parseInt(document.getElementById('export-mois-debut').value, 10), moisFin: parseInt(document.getElementById('export-mois-fin').value, 10) };
  api('exportProgrammation', [SESSION.token, filtres]).then(downloadCSV).catch(onSessionError);
});
document.getElementById('btn-export-realisation').addEventListener('click', () => {
  const filtres = { annee: STATE.annee, moisDebut: parseInt(document.getElementById('export-mois-debut').value, 10), moisFin: parseInt(document.getElementById('export-mois-fin').value, 10) };
  api('exportRealisation', [SESSION.token, filtres]).then(downloadCSV).catch(onSessionError);
});

function downloadPDF(res) {
  if (!res.success) { alert(res.error || 'Erreur export PDF.'); return; }
  const byteChars = atob(res.base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = res.filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}
document.getElementById('btn-export-programmation-pdf').addEventListener('click', () => {
  const filtres = { annee: STATE.annee, moisDebut: parseInt(document.getElementById('export-mois-debut').value, 10), moisFin: parseInt(document.getElementById('export-mois-fin').value, 10) };
  api('exportProgrammationPDF', [SESSION.token, filtres]).then(downloadPDF).catch(onSessionError);
});
document.getElementById('btn-export-realisation-pdf').addEventListener('click', () => {
  const filtres = { annee: STATE.annee, moisDebut: parseInt(document.getElementById('export-mois-debut').value, 10), moisFin: parseInt(document.getElementById('export-mois-fin').value, 10) };
  api('exportRealisationPDF', [SESSION.token, filtres]).then(downloadPDF).catch(onSessionError);
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
  const mien = mesActiviteN_();

  if (filterMode === 'non-planifiees') missions = missions.filter(m => m.nbJours === 0);
  else if (filterMode === 'planifiees') missions = missions.filter(m => m.nbJours > 0);
  else if (filterMode === 'mes-saisies') missions = missions.filter(m => m.identifiantSaisisseur === SESSION.identifiant);
  else if (filterMode === 'a-valider') missions = missions.filter(m => m.statutValidation === 'À valider');
  if (search) missions = missions.filter(m => (m.intitule || '').toLowerCase().includes(search) || (m.vehicules || []).join(' ').toLowerCase().includes(search));
  if (missions.length === 0) { wrap.innerHTML = '<div class="empty">Aucune mission ne correspond à ce filtre.</div>'; return; }

  wrap.innerHTML = `<table><thead><tr><th>ID</th><th>N° PTA</th><th class="col-libelle">Intitulé</th><th>Jours engagés</th><th>Véhicule(s) / Moyen</th><th>Saisi par</th><th>Statut</th><th>Validation</th><th>Paiement</th><th></th></tr></thead><tbody>
    ${missions.map(m => {
      const peutGererMissions = SESSION.role === "Responsable d'activité" || SESSION.role === 'Administrateur';
      const canEditOwnership = !m.identifiantSaisisseur || m.identifiantSaisisseur === SESSION.identifiant || SESSION.role === 'Administrateur';
      const canEditActivite = SESSION.role === 'Administrateur' || !m.activiteN || mien.includes(String(m.activiteN));
      const canEdit = peutGererMissions && canEditOwnership && canEditActivite;
      let actions = canEdit ? `<button class="btn btn-secondary btn-sm" onclick="openMissionForm(${m.row})">${m.nbJours > 0 ? 'Modifier' : 'Compléter'}</button>` : `<button class="btn btn-secondary btn-sm" disabled title="Réservé au responsable">🔒</button>`;
      if (peutGererMissions) actions += ` <button class="btn btn-secondary btn-sm" onclick="dupliquerMission(${m.row})" title="Dupliquer">⧉</button>`;
      actions += ` <button class="btn btn-secondary btn-sm" onclick="openDetail('${escapeAttr(m.id)}')" title="Commentaires / historique">💬</button>`;
      if (SESSION.role === 'Administrateur' && m.statutValidation === 'À valider') actions += ` <button class="btn btn-primary btn-sm" onclick="validerMission(${m.row})">Valider</button>`;
      const vehiculeAffiche = (m.vehicules && m.vehicules.length) ? m.vehicules.join(', ') : (m.moyenHorsFlotte ? m.moyenHorsFlotte + ' (hors flotte)' : '');
      let validationBadge = '<span class="badge" style="background:#eef1f5;color:#555;">—</span>';
      if (m.statutValidation === 'À valider') validationBadge = '<span class="badge badge-valider">À valider</span>';
      else if (m.statutValidation === 'Validée') validationBadge = '<span class="badge badge-validee">Validée</span>';
      let paiementBadge = '<span style="color:var(--gris);">—</span>';
      if (m.statutPaiement === 'Payé') paiementBadge = '<span class="badge badge-ok">Payé</span>';
      else if (m.statutPaiement === 'Partiellement payé') paiementBadge = '<span class="badge badge-occupe">Partiel</span>';
      else if (m.statutPaiement === 'Non payé') paiementBadge = '<span class="badge badge-warn">Non payé</span>';
      return `<tr>
      <td>${escapeHtml(m.id)}</td>
      <td>${m.activiteN ? escapeHtml(String(m.activiteN)) : '<span style="color:var(--gris);">hors PTA</span>'}</td>
      <td class="col-libelle">${escapeHtml(m.intitule)}</td>
      <td>${m.nbJours > 0 ? escapeHtml(m.joursEngages) + ` <span style="color:var(--gris);">(${m.nbJours} j.)</span>` : '<span style="color:var(--gris);">—</span>'}</td>
      <td>${escapeHtml(vehiculeAffiche) || '<span style="color:var(--gris);">Aucun</span>'}</td>
      <td>${escapeHtml(m.saisiPar || '') || '<span style="color:var(--gris);">—</span>'}</td>
      <td>${m.statut === 'Réalisé' ? '<span class="badge badge-ok">Réalisé</span>' : '<span class="badge" style="background:#eef1f5;color:#555;">Non réalisé</span>'}</td>
      <td>${validationBadge}</td>
      <td>${paiementBadge}</td>
      <td style="white-space:nowrap;">${actions}</td>
    </tr>`;
    }).join('')}</tbody></table>`;
}

// ---------------------------------------------------------------------
// VEHICULES
// ---------------------------------------------------------------------
document.getElementById('btn-add-vehicule').addEventListener('click', () => {
  const data = {
    immat: document.getElementById('v-immat').value.trim(), modele: document.getElementById('v-modele').value.trim(),
    type: document.getElementById('v-type').value, statut: document.getElementById('v-statut').value,
    affectation: document.getElementById('v-affectation').value.trim(), observations: document.getElementById('v-observations').value.trim()
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
  const isAdmin = SESSION.role === 'Administrateur';
  const canManage = SESSION.role === 'Gestionnaire Parc' || isAdmin;
  if (STATE.vehicules.length === 0) { wrap.innerHTML = '<div class="empty">Aucun véhicule enregistré.</div>'; return; }
  wrap.innerHTML = `<table><thead><tr><th>ID</th><th>Immat.</th><th>Modèle</th><th>Type</th><th>Statut</th><th>Affectation</th><th>Prochaine visite technique</th>${isAdmin ? '<th>Verrouillage</th>' : ''}</tr></thead><tbody>
    ${STATE.vehicules.map(v => {
      const editable = canManage && (!v.verrouille || isAdmin);
      return `<tr${v.verrouille ? ' style="background:#fbf6ee;"' : ''}><td>${escapeHtml(v.id)}</td><td>${escapeHtml(v.immat)}</td><td>${escapeHtml(v.modele || '')}</td><td>${escapeHtml(v.type || '')}</td>
      <td>${editable ? `<select onchange="changeStatut(${v.row}, this.value)">${['Disponible','En mission','En maintenance','Hors service'].map(s => `<option ${s === v.statut ? 'selected' : ''}>${s}</option>`).join('')}</select>` : `${escapeHtml(v.statut || '')}${v.verrouille ? ' 🔒' : ''}`}</td>
      <td>${escapeHtml(v.affectation || '')}</td>
      <td>${editable ? `<input type="date" value="${dmyToISO(v.prochaineVisite || '') || ''}" onchange="changeVisite(${v.row}, this.value)" style="min-width:130px;">` : escapeHtml(v.prochaineVisite || '—')}</td>
      ${isAdmin ? `<td><button class="btn btn-sm ${v.verrouille ? 'btn-danger' : 'btn-secondary'}" onclick="toggleVerrouVehicule(${v.row}, ${!v.verrouille})">${v.verrouille ? 'Déverrouiller' : 'Verrouiller'}</button></td>` : ''}
      </tr>`;
    }).join('')}</tbody></table>`;
}
function changeStatut(row, statut) { api('updateVehiculeStatut', [SESSION.token, row, statut]).then(res => { if (res && res.success === false) { alert(res.error); } loadInitialData(); }).catch(onSessionError); }
function changeVisite(row, dateISO) { api('updateVehiculeVisite', [SESSION.token, row, dateISO]).then(res => { if (res && res.success === false) { alert(res.error); } loadInitialData(); }).catch(onSessionError); }
function toggleVerrouVehicule(row, verrouille) { api('verrouillerVehicule', [SESSION.token, row, verrouille]).then(loadInitialData).catch(onSessionError); }

// ---------------------------------------------------------------------
// MON SUIVI
// ---------------------------------------------------------------------
function loadMonSuivi() { if (!SESSION.token) return; api('getMonDashboard', [SESSION.token, STATE.annee]).then(renderMonSuivi).catch(onSessionError); }

function renderMonSuivi(d) {
  const wrap = document.getElementById('mon-suivi-content');
  if (d.role === 'Consultation' || d.role === 'Gestionnaire Parc' || d.role === 'Comptable') {
    wrap.innerHTML = `<div class="card"><div class="empty">Votre rôle n'est pas rattaché à des activités PTA. Consultez le tableau de bord général.</div></div>`;
    return;
  }

  let resumeHtml = '';
  if (d.avancementGlobal) {
    const g = d.avancementGlobal;
    resumeHtml += `<div class="card">
      <h2>Mon avancement global — ${d.annee}</h2>
      <div class="kpi-row">
        <div class="kpi"><div class="n">${g.nbMissions}</div><div class="l">Mission(s) au total</div></div>
        <div class="kpi"><div class="n">${g.pctPlanifie}%</div><div class="l">Taux de planification</div></div>
        <div class="kpi"><div class="n">${g.pctRealise}%</div><div class="l">Taux d'exécution</div></div>
      </div>
      ${(d.alertesVehicules && d.alertesVehicules.length) ? `<h3>⚠ Alerte(s) maintenance sur mes véhicules</h3>
        ${d.alertesVehicules.map(a => `<div class="alert alert-error" style="margin-bottom:6px;">${escapeHtml(a.immat)} (${escapeHtml(a.modele || '')}) — visite technique ${a.statut === 'depassee' ? 'dépassée' : 'à moins de 30 jours'} (${escapeHtml(a.prochaineVisite)})</div>`).join('')}` : ''}
      ${(d.disponibiliteVehiculesDuMois && d.disponibiliteVehiculesDuMois.length) ? `<h3>Disponibilité de mes véhicules ce mois-ci</h3>
        <table><thead><tr><th>Véhicule</th><th>Statut</th><th>Jours occupés ce mois (miens)</th></tr></thead><tbody>
        ${d.disponibiliteVehiculesDuMois.map(v => `<tr><td>${escapeHtml(v.immat)} ${v.modele ? '- ' + escapeHtml(v.modele) : ''}</td><td><span class="badge ${v.statutDeclare === 'Disponible' ? 'badge-dispo' : 'badge-occupe'}">${escapeHtml(v.statutDeclare)}</span></td><td>${v.joursOccupesCeMois}</td></tr>`).join('')}
        </tbody></table>` : ''}
    </div>`;
  }

  if (d.activites.length === 0) {
    wrap.innerHTML = resumeHtml + `<div class="card"><div class="empty">Vous n'avez encore pris en charge aucune activité PTA pour ${d.annee}. Rendez-vous dans l'onglet "Activités PTA".</div></div>`;
    return;
  }
  wrap.innerHTML = resumeHtml + `
    <div class="card">
      <h2>Avancement de mes activités PTA — ${d.annee}</h2>
      ${d.activites.map(a => `
        <div class="activite-card">
          <div class="titre">N°${escapeHtml(String(a.n))} - ${escapeHtml(a.intitule)}${a.qualification ? `<span class="qualif-tag">${escapeHtml(a.qualification)}</span>` : ''}</div>
          <div style="font-size:12.5px;color:var(--gris);margin-bottom:6px;">${escapeHtml(a.structureResp || '')} · Budget : ${escapeHtml(String(a.coutBudgetise || 0))} milliers FCFA · Engagé : ${escapeHtml(String(a.budgetEngage))} milliers FCFA</div>
          <div style="font-size:12.5px;">Planification : ${a.planifiees}/${a.nbMissions} mission(s) planifiée(s) (${a.pctPlanifie}%)</div>
          <div class="progress-bar"><div style="width:${a.pctPlanifie}%;"></div></div>
          <div style="font-size:12.5px;margin-top:6px;">Réalisation : ${a.realisees}/${a.nbMissions} mission(s) réalisée(s) (${a.pctRealise}%)</div>
          <div class="progress-bar"><div style="width:${a.pctRealise}%;background:var(--accent);"></div></div>
          ${a.prochaineMission ? `<div style="font-size:12px;margin-top:8px;color:var(--navy);">Prochaine échéance : ${escapeHtml(a.prochaineMission.id)} - ${escapeHtml(a.prochaineMission.joursEngages)}</div>` : ''}
        </div>`).join('')}
    </div>
    <div class="card">
      <h2>Mes dernières saisies</h2>
      ${d.mesMissionsRecentes.length === 0 ? '<div class="empty">Aucune saisie pour le moment.</div>' : `<table><thead><tr><th>ID</th><th class="col-libelle">Intitulé</th><th>Statut</th><th>Date de saisie</th></tr></thead><tbody>
        ${d.mesMissionsRecentes.map(m => `<tr><td>${escapeHtml(m.id)}</td><td class="col-libelle">${escapeHtml(m.intitule)}</td><td>${escapeHtml(m.statut)}</td><td>${escapeHtml(m.dateSaisie || '')}</td></tr>`).join('')}
      </tbody></table>`}
    </div>`;
}

// ---------------------------------------------------------------------
// FINANCES (Comptable / Administrateur)
// ---------------------------------------------------------------------
document.getElementById('btn-export-financier-pdf').addEventListener('click', () => {
  api('exportRapportFinancierPDF', [SESSION.token, STATE.annee]).then(downloadPDF).catch(onSessionError);
});

function loadFinances() {
  if (!SESSION.token) return;
  api('getRealisationFinanciere', [SESSION.token, STATE.annee]).then(d => { renderFinances(d); renderFinanceStackedChart(d); }).catch(onSessionError);
  api('getPaiements', [SESSION.token, STATE.annee]).then(renderPaiements).catch(onSessionError);
  api('getFinancesParAnnee', [SESSION.token]).then(renderFinanceTrendChart).catch(() => {
    document.getElementById('finance-trend-chart').innerHTML = '<div class="empty">Non disponible.</div>';
  });
  api('getDashboardComptable', [SESSION.token, STATE.annee]).then(renderDashboardComptable).catch(() => {});
  const selActivite = document.getElementById('p-activite');
  selActivite.innerHTML = (STATE.activites.length ? STATE.activites : []).map(a => `<option value="${a.n}">N°${a.n} - ${escapeHtml(truncate(a.intitule, 50))}</option>`).join('');
  if (!STATE.activites.length) {
    api('getInitialData', [SESSION.token, STATE.annee]).then(d => {
      STATE.activites = d.activites;
      STATE.missions = d.missions;
      selActivite.innerHTML = STATE.activites.map(a => `<option value="${a.n}">N°${a.n} - ${escapeHtml(truncate(a.intitule, 50))}</option>`).join('');
      updatePaiementMissionSelect();
    }).catch(() => {});
  }
  updatePaiementMissionSelect();
}

function updatePaiementMissionSelect() {
  const sel = document.getElementById('p-mission');
  if (!sel) return;
  const activiteN = document.getElementById('p-activite').value;
  const missions = (STATE.missions || []).filter(m => String(m.activiteN) === String(activiteN) && m.statut === 'Réalisé');
  sel.innerHTML = '<option value="">— Aucune (paiement au niveau de l\'activité) —</option>' +
    missions.map(m => `<option value="${escapeAttr(m.id)}">${escapeHtml(m.id)} - ${escapeHtml(truncate(m.intitule, 40))}</option>`).join('');
}
document.getElementById('p-activite').addEventListener('change', updatePaiementMissionSelect);

let _dashComptableCache = null;
function renderDashboardComptable(d) {
  _dashComptableCache = d;
  const selResp = document.getElementById('comptable-filtre-responsable');
  const responsables = Array.from(new Set(d.missions.map(m => m.saisiPar).filter(Boolean))).sort();
  const valeurActuelle = selResp.value;
  selResp.innerHTML = '<option value="">Tous les responsables</option>' + responsables.map(r => `<option value="${escapeAttr(r)}" ${r === valeurActuelle ? 'selected' : ''}>${escapeHtml(r)}</option>`).join('');
  drawDashboardComptable();
}

function drawDashboardComptable() {
  const d = _dashComptableCache;
  if (!d) return;
  const filtre = document.getElementById('comptable-filtre-responsable').value;

  const statsWrap = document.getElementById('comptable-stats-wrap');
  const lignes = filtre ? d.statsParResponsable.filter(s => s.responsable === filtre) : d.statsParResponsable;
  const g = d.statsGlobal;
  statsWrap.innerHTML = `
    <div class="kpi-row">
      <div class="kpi"><div class="n">${g.executee}</div><div class="l">Exécutées et validées (zone)</div></div>
      <div class="kpi"><div class="n">${g.en_attente_validation}</div><div class="l">Réalisées, en attente de validation Admin</div></div>
      <div class="kpi"><div class="n">${g.en_cours}</div><div class="l">En cours (zone)</div></div>
      <div class="kpi"><div class="n">${g.en_retard}</div><div class="l">En retard (zone)</div></div>
    </div>
    <table><thead><tr><th>Responsable</th><th>Exécutées (validées)</th><th>En attente validation</th><th>En cours</th><th>Non réalisées</th><th>En retard</th><th>Total</th></tr></thead><tbody>
      ${lignes.length === 0 ? '<tr><td colspan="7" class="empty">Aucune mission.</td></tr>' : lignes.map(s => `<tr><td>${escapeHtml(s.responsable)}</td><td>${s.executee}</td><td>${s.en_attente_validation}</td><td>${s.en_cours}</td><td>${s.non_realisee}</td><td>${s.en_retard}</td><td><b>${s.total}</b></td></tr>`).join('')}
    </tbody></table>`;

  const missionsWrap = document.getElementById('comptable-missions-wrap');
  const missionsFiltrees = filtre ? d.missions.filter(m => m.saisiPar === filtre) : d.missions;
  missionsWrap.innerHTML = missionsFiltrees.length === 0 ? '<div class="empty">Aucune mission.</div>' : `<table><thead><tr><th>ID</th><th class="col-libelle">Intitulé</th><th>Responsable</th><th>Exécution</th></tr></thead><tbody>
    ${missionsFiltrees.map(m => {
      const labels = { executee: ['Exécutée (validée)', 'badge-ok'], en_attente_validation: ['En attente validation Admin', 'badge-valider'], en_cours: ['En cours', 'badge-occupe'], non_realisee: ['Non réalisée', 'badge-nonplanifiee'], en_retard: ['En retard', 'badge-warn'] };
      const [txt, cls] = labels[m.statutExecution] || ['—', ''];
      return `<tr><td>${escapeHtml(m.id)}</td><td class="col-libelle">${escapeHtml(m.intitule)}</td><td>${escapeHtml(m.saisiPar || '—')}</td><td><span class="badge ${cls}">${txt}</span></td></tr>`;
    }).join('')}
  </tbody></table>`;

  document.getElementById('comptable-activites-payees').innerHTML = d.activitesPayees.length === 0 ? '<div class="empty">Aucune.</div>' :
    d.activitesPayees.map(a => `<div class="hist-item">N°${escapeHtml(String(a.n))} - ${escapeHtml(a.intitule)} — ${escapeHtml(a.responsable)} (${fmtMilliers(a.paye)} / ${fmtMilliers(a.engage)})</div>`).join('');
  document.getElementById('comptable-activites-non-payees').innerHTML = d.activitesNonPayees.length === 0 ? '<div class="empty">Aucune.</div>' :
    d.activitesNonPayees.map(a => `<div class="hist-item">N°${escapeHtml(String(a.n))} - ${escapeHtml(a.intitule)} — ${escapeHtml(a.responsable)} (${fmtMilliers(a.paye)} / ${fmtMilliers(a.engage)})</div>`).join('');
}
document.getElementById('comptable-filtre-responsable').addEventListener('change', drawDashboardComptable);

function renderFinances(d) {
  const kpiWrap = document.getElementById('finances-kpis');
  const pct = d.totaux.budgetise ? Math.round(100 * d.totaux.engage / d.totaux.budgetise) : 0;
  const pctPaye = d.totaux.engage ? Math.round(100 * d.totaux.paye / d.totaux.engage) : 0;
  kpiWrap.innerHTML = `<div class="kpi-row">
    <div class="kpi"><div class="n">${fmtMilliers(d.totaux.budgetise)}</div><div class="l">Budget total PTA (milliers FCFA)</div></div>
    <div class="kpi"><div class="n">${fmtMilliers(d.totaux.engage)}</div><div class="l">Engagé (${pct}% du budget)</div></div>
    <div class="kpi"><div class="n">${fmtMilliers(d.totaux.paye)}</div><div class="l">Payé (${pctPaye}% de l'engagé)</div></div>
    <div class="kpi"><div class="n">${d.detail.length}</div><div class="l">Activités PTA — ${d.annee}</div></div>
  </div>`;

  const wrap = document.getElementById('realisation-financiere-wrap');
  if (d.detail.length === 0) { wrap.innerHTML = '<div class="empty">Aucune activité pour cette année.</div>'; return; }
  wrap.innerHTML = `<table><thead><tr><th>N°</th><th class="col-libelle">Intitulé</th><th>Budgétisé</th><th>Engagé</th><th>Payé</th><th>% engagé/budget</th><th>% payé/engagé</th></tr></thead><tbody>
    ${d.detail.map(a => `<tr><td>${escapeHtml(String(a.n))}</td><td class="col-libelle">${escapeHtml(a.intitule)}</td><td>${fmtMilliers(a.budgetise)}</td><td>${fmtMilliers(a.engage)}</td><td>${fmtMilliers(a.paye)}</td>
      <td>${a.pctEngageSurBudget}%</td><td>${a.pctPayeSurEngage}%</td></tr>`).join('')}</tbody></table>`;
}

function renderPaiements(list) {
  const wrap = document.getElementById('paiements-table-wrap');
  if (list.length === 0) { wrap.innerHTML = '<div class="empty">Aucun paiement enregistré.</div>'; return; }
  wrap.innerHTML = `<table><thead><tr><th>Date</th><th>N° Activité</th><th>Mission</th><th>Montant</th><th>Référence</th><th>Justificatif</th><th>Enregistré par</th><th></th></tr></thead><tbody>
    ${list.map(p => `<tr><td>${escapeHtml(p.datePaiement)}</td><td>${escapeHtml(String(p.activiteN))}</td><td>${escapeHtml(p.missionId || '—')}</td><td>${fmtMilliers(p.montant)}</td><td>${escapeHtml(p.reference || '')}</td>
      <td>${p.justificatifUrl ? `<a href="${escapeAttr(p.justificatifUrl)}" target="_blank" rel="noopener">Voir</a>` : '—'}</td><td>${escapeHtml(p.enregistrePar)}</td>
      <td><button class="btn btn-secondary btn-sm" onclick="deletePaiement(${p.row})">Supprimer</button></td></tr>`).join('')}</tbody></table>`;
}

document.getElementById('btn-add-paiement').addEventListener('click', () => {
  const data = {
    annee: STATE.annee, activiteN: document.getElementById('p-activite').value, missionId: document.getElementById('p-mission').value,
    montant: parseFloat(document.getElementById('p-montant').value) || 0,
    datePaiement: document.getElementById('p-date').value, reference: document.getElementById('p-reference').value.trim(), observations: document.getElementById('p-observations').value.trim()
  };
  if (!data.activiteN || !data.montant || !data.datePaiement) { showAlert('paiement-alert', 'error', 'Activité, montant et date sont obligatoires.'); return; }
  const fichier = document.getElementById('p-justificatif').files[0];
  const envoyer = () => {
    api('addPaiement', [SESSION.token, data]).then(res => {
      if (!res.success) { showAlert('paiement-alert', 'error', res.error || 'Erreur.'); return; }
      showAlert('paiement-alert', 'success', '✅ Paiement enregistré.' + (data.justificatifBase64 && !res.justificatifUrl ? ' (le justificatif n\'a pas pu être téléversé)' : ''));
      ['p-montant','p-date','p-reference','p-observations'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('p-mission').value = '';
      document.getElementById('p-justificatif').value = '';
      loadFinances();
    }).catch(onSessionError);
  };
  if (fichier) {
    const reader = new FileReader();
    reader.onload = () => { data.justificatifBase64 = reader.result; data.justificatifNom = fichier.name; envoyer(); };
    reader.readAsDataURL(fichier);
  } else {
    envoyer();
  }
});
function deletePaiement(row) { if (!confirm('Supprimer ce paiement ?')) return; api('deletePaiement', [SESSION.token, row]).then(loadFinances).catch(onSessionError); }
function fmtMilliers(n) { return (parseFloat(n) || 0).toLocaleString('fr-FR'); }

/** Une barre empilée par activité : payé (bas) + engagé restant (haut) jusqu'au
 *  total engagé, avec un repère horizontal marquant le budget prévu. */
function renderFinanceStackedChart(d) {
  const el = document.getElementById('finance-stacked-chart');
  if (!d.detail.length) { el.innerHTML = ''; return; }
  const maxVal = Math.max.apply(null, d.detail.map(a => Math.max(a.budgetise, a.engage)).concat([1]));
  const HAUTEUR = 150;
  el.innerHTML = `<div style="display:flex; align-items:flex-end; gap:14px; height:${HAUTEUR + 40}px; overflow-x:auto; padding:10px 4px;">
    ${d.detail.map(a => {
      const hBudget = Math.round((a.budgetise / maxVal) * HAUTEUR);
      const hEngage = Math.round((a.engage / maxVal) * HAUTEUR);
      const hPaye = Math.round((a.paye / maxVal) * HAUTEUR);
      return `<div style="display:flex; flex-direction:column; align-items:center; min-width:52px;">
        <div style="position:relative; width:34px; height:${HAUTEUR}px; background:#f5f6f8; border-radius:4px 4px 0 0; display:flex; flex-direction:column; justify-content:flex-end;">
          <div style="position:absolute; left:-6px; right:-6px; top:${HAUTEUR - hBudget}px; border-top:2px dashed var(--rouge);" title="Budget : ${fmtMilliers(a.budgetise)}"></div>
          <div style="width:100%; height:${hEngage}px; background:var(--accent); border-radius:${hPaye >= hEngage ? '4px 4px 0 0' : '0'};"></div>
          <div style="width:100%; height:${hPaye}px; background:var(--teal); margin-top:-${hPaye}px; border-radius:4px 4px 0 0;"></div>
        </div>
        <div style="font-size:9.5px; color:var(--gris); font-weight:700; margin-top:6px; text-align:center;">N°${escapeHtml(String(a.n))}</div>
      </div>`;
    }).join('')}
  </div>
  <div style="font-size:11px;color:var(--gris);margin-top:4px;">
    <span style="color:var(--teal);font-weight:700;">■</span> payé &nbsp;
    <span style="color:var(--accent);font-weight:700;">■</span> engagé (dont payé) &nbsp;
    <span style="color:var(--rouge);">┄</span> budget prévu
  </div>`;
}

function renderFinanceTrendChart(data) {
  const el = document.getElementById('finance-trend-chart');
  if (!data || data.length === 0) { el.innerHTML = '<div class="empty">Pas assez de données.</div>'; return; }
  const maxVal = Math.max.apply(null, data.map(d => Math.max(d.budgetise, d.engage, d.paye)).concat([1]));
  const HAUTEUR = 130;
  el.innerHTML = `<div style="display:flex; align-items:flex-end; gap:22px; height:${HAUTEUR + 40}px; overflow-x:auto; padding:10px 4px;">
    ${data.map(d => `<div style="display:flex; flex-direction:column; align-items:center;">
      <div style="display:flex; align-items:flex-end; gap:4px; height:${HAUTEUR}px;">
        <div title="Budget" style="width:16px; height:${Math.round((d.budgetise / maxVal) * HAUTEUR)}px; background:#c7cedb; border-radius:3px 3px 0 0;"></div>
        <div title="Engagé" style="width:16px; height:${Math.round((d.engage / maxVal) * HAUTEUR)}px; background:var(--accent); border-radius:3px 3px 0 0;"></div>
        <div title="Payé" style="width:16px; height:${Math.round((d.paye / maxVal) * HAUTEUR)}px; background:var(--teal); border-radius:3px 3px 0 0;"></div>
      </div>
      <div style="font-size:11px; color:var(--navy); font-weight:700; margin-top:6px;">${d.annee}</div>
    </div>`).join('')}
  </div>
  <div style="font-size:11px;color:var(--gris);margin-top:4px;">
    <span style="color:#c7cedb;font-weight:700;">■</span> budget &nbsp;
    <span style="color:var(--accent);font-weight:700;">■</span> engagé &nbsp;
    <span style="color:var(--teal);font-weight:700;">■</span> payé
  </div>`;
}

// ---------------------------------------------------------------------
// GESTION DES COMPTES (Administrateur)
// ---------------------------------------------------------------------
document.getElementById('btn-add-user').addEventListener('click', () => {
  const data = {
    nom: document.getElementById('u-nom').value.trim(), identifiant: document.getElementById('u-id').value.trim(),
    motDePasse: document.getElementById('u-pw').value, qualite: document.getElementById('u-qualite').value.trim(),
    email: document.getElementById('u-email').value.trim(),
    role: document.getElementById('u-role').value, observations: document.getElementById('u-observations').value.trim()
  };
  if (!data.nom || !data.identifiant || !data.motDePasse) { showAlert('user-alert', 'error', 'Nom, identifiant et mot de passe sont obligatoires.'); return; }
  api('addUser', [SESSION.token, data]).then(res => {
    if (!res.success) { showAlert('user-alert', 'error', res.error || 'Erreur.'); return; }
    ['u-nom','u-id','u-pw','u-qualite','u-email','u-observations'].forEach(id => document.getElementById(id).value = '');
    showAlert('user-alert', 'success', '✅ Compte créé.');
    loadUsers();
  }).catch(onSessionError);
});

function loadUsers() { api('listUsers', [SESSION.token]).then(users => { STATE.users = users; renderUsers(users); }).catch(onSessionError); }
function renderUsers(users) {
  document.getElementById('users-table-wrap').innerHTML = `<table><thead><tr><th>Nom</th><th>Identifiant</th><th>Rôle</th><th>Email</th><th>Actif</th><th></th></tr></thead><tbody>
    ${users.map(u => `<tr><td>${escapeHtml(u.nom)}</td><td>${escapeHtml(u.identifiant)}</td><td>${escapeHtml(u.role)}</td><td>${escapeHtml(u.email || '—')}</td>
      <td>${u.actif ? '<span class="badge badge-ok">Actif</span>' : '<span class="badge badge-warn">Désactivé</span>'}</td>
      <td style="white-space:nowrap;"><button class="btn btn-secondary btn-sm" onclick="toggleUserActive(${u.row}, ${!u.actif})">${u.actif ? 'Désactiver' : 'Activer'}</button>
      <button class="btn btn-secondary btn-sm" onclick="resetUserPassword(${u.row})">Réinitialiser mdp</button></td></tr>`).join('')}</tbody></table>`;
}
function toggleUserActive(row, actif) { api('setUserActive', [SESSION.token, row, actif]).then(loadUsers).catch(onSessionError); }
function resetUserPassword(row) {
  const pwd = prompt("Nouveau mot de passe (4 caractères minimum) :");
  if (!pwd) return;
  api('resetPassword', [SESSION.token, row, pwd]).then(res => { if (!res.success) { alert(res.error || 'Erreur.'); return; } alert('Mot de passe réinitialisé.'); }).catch(onSessionError);
}

// ---------------------------------------------------------------------
// DASHBOARD (public)
// ---------------------------------------------------------------------
function loadDashboard() {
  api('getDashboard', [STATE.annee]).then(renderDashboard).catch(err => {
    document.getElementById('dashboard-content').innerHTML = `<div class="alert alert-error">Erreur de chargement : ${escapeHtml(err.message || String(err))}</div>`;
  });
  api('getTauxExecution', []).then(renderTauxExecutionChart).catch(() => {});
}

function renderAlertesMaintenance(alertes) {
  const el = document.getElementById('alertes-maintenance');
  if (!el) return;
  if (!alertes || alertes.length === 0) { el.innerHTML = '<div class="empty">Aucune alerte de maintenance en cours.</div>'; return; }
  el.innerHTML = `<table><thead><tr><th>Véhicule</th><th>Modèle</th><th>Prochaine visite technique</th><th>Statut</th></tr></thead><tbody>
    ${alertes.map(a => `<tr><td>${escapeHtml(a.immat)}</td><td>${escapeHtml(a.modele || '')}</td><td>${escapeHtml(a.prochaineVisite)}</td>
      <td>${a.statut === 'depassee' ? '<span class="badge badge-warn">Dépassée</span>' : '<span class="badge badge-occupe">Bientôt</span>'}</td></tr>`).join('')}
  </tbody></table>`;
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
      <h2>Avancement de la planification du PTA — ${d.annee}</h2>
      <p style="font-size:13px;color:var(--gris);margin:0 0 4px;">${d.avancementPTA.planifiees} / ${d.avancementPTA.total} activités planifiées (${pctPlanif}%)</p>
      <div class="progress-bar"><div style="width:${pctPlanif}%;"></div></div>
      <p style="font-size:13px;color:var(--gris);margin:10px 0 4px;">${d.avancementPTA.realisees} / ${d.avancementPTA.total} activités réalisées (${pctRealise}%)</p>
      <div class="progress-bar"><div style="width:${pctRealise}%;background:var(--accent);"></div></div>
    </div>
    <div class="card"><h2>Taux d'exécution du PTA dans le temps</h2><div id="taux-execution-chart"><div class="loading">Chargement…</div></div></div>
    <div class="card"><h2>Alertes de maintenance véhicules</h2><div id="alertes-maintenance"><div class="loading">Chargement…</div></div></div>
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
  api('getAlertesMaintenance', []).then(renderAlertesMaintenance).catch(() => {});
}

function renderTauxExecutionChart(data) {
  const el = document.getElementById('taux-execution-chart');
  if (!el) return;
  if (!data || data.length === 0) { el.innerHTML = '<div class="empty">Pas assez de données.</div>'; return; }
  el.innerHTML = `<div class="mini-bar-chart">
    ${data.map(d => `<div class="col">
      <div class="bar-group">
        <div style="flex:1; display:flex; flex-direction:column; justify-content:flex-end; align-items:center;">
          <div class="val">${d.pctPlanifie}%</div>
          <div class="bar" style="height:${Math.max(d.pctPlanifie, 2)}%;"></div>
        </div>
        <div style="flex:1; display:flex; flex-direction:column; justify-content:flex-end; align-items:center;">
          <div class="val">${d.pctRealise}%</div>
          <div class="bar secondary" style="height:${Math.max(d.pctRealise, 2)}%;"></div>
        </div>
      </div>
      <div class="lbl">${d.annee}</div>
    </div>`).join('')}
  </div>
  <div style="font-size:11.5px;color:var(--gris);margin-top:8px;">
    <span style="color:var(--teal);font-weight:700;">■</span> % planifié &nbsp; <span style="color:var(--accent);font-weight:700;">■</span> % réalisé
  </div>`;
}

// ---------------------------------------------------------------------
// UTILS
// ---------------------------------------------------------------------
function escapeHtml(s) { return (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function escapeAttr(s) { return escapeHtml(s); }
function truncate(s, n) { s = s || ''; return s.length > n ? s.slice(0, n) + '…' : s; }

document.getElementById('pta-annee-source').addEventListener('focus', function () {
  if (!this.options.length) this.innerHTML = STATE.annees.map(a => `<option value="${a}">${a}</option>`).join('');
});

init();
