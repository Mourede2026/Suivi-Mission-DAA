// ===========================================================================
// INSTALLATION DE L'APPLICATION (tablette / ordinateur)
// - Chrome, Edge, Android, Windows, ChromeOS : bouton qui lance l'installation.
// - iPad / iPhone / Safari Mac : le navigateur n'a pas d'invite automatique,
//   on affiche donc la marche à suivre.
// ===========================================================================
(function () {
  const block = document.getElementById('install-block');
  const btn = document.getElementById('btn-install-app');
  const help = document.getElementById('install-help');
  if (!block || !btn) return;

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isStandalone) return; // déjà installée : on ne montre rien

  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /safari/i.test(ua) && !/chrome|crios|fxios|edg|android/i.test(ua);
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    block.style.display = 'block';
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    block.style.display = 'none';
  });

  // Safari / iPadOS : pas d'événement, on montre le bouton avec les instructions
  if (isIOS || isSafari) block.style.display = 'block';

  btn.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch (e) {}
      deferredPrompt = null;
      block.style.display = 'none';
      return;
    }
    if (isIOS) {
      help.innerHTML = 'Dans Safari, touchez <b>Partager</b> (carré avec flèche), puis <b>Sur l\u2019écran d\u2019accueil</b>.';
    } else if (isSafari) {
      help.innerHTML = 'Dans Safari : menu <b>Fichier</b> \u2192 <b>Ajouter au Dock</b>.';
    }
    help.style.display = 'block';
  });
})();
