// ===========================================================================
// TRANSPORT JSONP : permet à une page statique (GitHub Pages) d'appeler
// Google Apps Script sans être bloquée par le CORS du navigateur.
// Apps Script ne pose pas les en-têtes CORS nécessaires à un fetch() classique
// cross-origin ; on utilise donc une balise <script> (JSONP), qui n'est jamais
// soumise au CORS. Le vrai contrôle d'accès reste fait par Code.gs côté serveur.
// ===========================================================================

let _jsonpCounter = 0;

function api(fn, args) {
  return new Promise((resolve, reject) => {
    if (!WEBAPP_URL || WEBAPP_URL.indexOf("COLLEZ_ICI") !== -1) {
      reject(new Error("L'application n'est pas encore configurée : renseignez WEBAPP_URL dans config.js."));
      return;
    }
    const cbName = "__jsonp_cb_" + (_jsonpCounter++) + "_" + Date.now();
    const script = document.createElement("script");

    window[cbName] = function (result) {
      cleanup();
      resolve(result);
    };

    function cleanup() {
      delete window[cbName];
      if (script.parentNode) script.parentNode.removeChild(script);
      clearTimeout(timeoutId);
    }

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("Délai dépassé : le serveur Apps Script n'a pas répondu (vérifiez WEBAPP_URL et le déploiement)."));
    }, 20000);

    script.onerror = () => {
      cleanup();
      reject(new Error("Impossible de joindre le serveur Apps Script (vérifiez WEBAPP_URL et le déploiement 'Qui a accès : Tout le monde')."));
    };

    const params = new URLSearchParams({
      api: "1",
      fn: fn,
      args: JSON.stringify(args || []),
      callback: cbName
    });
    script.src = WEBAPP_URL + "?" + params.toString();
    document.body.appendChild(script);
  });
}
