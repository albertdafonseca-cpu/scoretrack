// Origine publique du site qui appelle l'API, pour les adresses de retour de Stripe.
// Liste fermée : on ne renvoie jamais vers un hôte fourni par la requête sans le vérifier.
const HOTES = /^(scoretrack\.newgames\.app|scoretrack-test\.newgames\.app|[a-z0-9-]+\.vercel\.app)$/;

function origine(req) {
  const hote = String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
  return HOTES.test(hote) ? 'https://' + hote : 'https://scoretrack.newgames.app';
}

module.exports = { origine };
