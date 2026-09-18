// Page Joueurs : saisie des prénoms (18 caractères max, indépendant de l'écran), profils mémorisés
// accessibles au clavier, mélange, mémoire des derniers noms par préréglage.
import { COLORS } from '../core/constants.js';
import { nameMaxLength } from '../core/layout.js';
import { KEYS, parseProfiles, serializeProfiles, addProfiles } from '../core/save-schema.js';
import { readJSON, writeJSON, remove } from '../platform/storage.js';
import { store } from '../store.js';
import { announce, armConfirm } from './a11y.js';
import { byId, el, qsa, show, hide, showPage, icon } from './dom.js';
import { lastNamesFor, rememberLastNames } from './settings.js';
import { currentPresetKey } from './setup.js';

/** Plafond absolu de saisie ; la limite réelle vient de `nameMaxLength` (js/core/layout.js). */
export const NAME_MAX_LEN = 18;

/** Limite en vigueur pour la configuration et l'écran courants (source unique : nameMaxLength). */
let currentMaxLen = NAME_MAX_LEN;

/** Longueur maximale affichable sur la plus petite carte de la disposition courante. */
export function currentNameMaxLength() {
  return currentMaxLen;
}

let lastFocusedInput = null;

const nameInputs = () => qsa('.name-input');

/** Prénoms mémorisés (liste vide si aucun). */
export function loadProfiles() {
  return parseProfiles(readJSON(KEYS.profiles, []));
}

function fillName(name) {
  const inputs = nameInputs();
  // Utiliser la dernière case explicitement cliquée/focalisée, sinon la première case vide.
  const target =
    (lastFocusedInput && inputs.includes(lastFocusedInput) && lastFocusedInput) ||
    inputs.find((inp) => !inp.value.trim());
  if (!target) {
    announce('Toutes les cases sont remplies', 'assertive');
    return;
  }
  target.value = name.slice(0, currentMaxLen);
  refreshNameActions();
  const idx = inputs.indexOf(target);
  announce(`${name} placé en joueur ${idx + 1}`);
  // Case suivante prête à recevoir le prochain profil
  lastFocusedInput = inputs[idx + 1] || null;
}

function deleteProfile(name) {
  const profiles = loadProfiles().filter((p) => p !== name);
  writeJSON(KEYS.profiles, serializeProfiles(profiles));
  renderProfileChips();
  refreshNameActions();
  announce(`${name} oublié`);
  byId('profiles-list').querySelector('button')?.focus();
}

function profileChip(name) {
  const use = el('button', {
    type: 'button',
    className: 'profile-chip-use',
    'aria-label': `Utiliser le prénom ${name}`,
    text: name,
  });
  use.addEventListener('click', () => fillName(name));
  const del = el(
    'button',
    {
      type: 'button',
      className: 'profile-chip-del',
      'aria-label': `Oublier le prénom ${name}`,
    },
    icon('close', '✕'),
  );
  // Suppression en deux temps : un seul appui ne détruit rien.
  del.addEventListener('click', () => {
    const confirmed = armConfirm(del, {
      ariaLabel: `Confirmer l'oubli du prénom ${name}`,
      message: `Appuyez de nouveau pour oublier ${name}`,
    });
    if (confirmed) deleteProfile(name);
  });
  return el('div', { className: 'profile-chip' }, use, del);
}

/** (Re)construit la liste des puces de profils. */
export function renderProfileChips() {
  const profiles = loadProfiles();
  const list = byId('profiles-list');
  list.replaceChildren();
  if (!profiles.length) {
    hide(list);
    return;
  }
  show(list);
  profiles.forEach((name) => list.appendChild(profileChip(name)));
}

/** Mémorise les prénoms saisis (uniques, 30 max). */
export function saveProfiles() {
  const names = collectNames().filter(Boolean);
  if (!names.length) {
    announce('Aucun prénom à mémoriser', 'assertive');
    return;
  }
  writeJSON(KEYS.profiles, serializeProfiles(addProfiles(loadProfiles(), names)));
  renderProfileChips();
  refreshNameActions();
  announce(
    `${names.length} prénom${names.length > 1 ? 's' : ''} mémorisé${names.length > 1 ? 's' : ''}`,
  );
}

/** Supprime tous les profils mémorisés. */
export function clearSavedNames(btn) {
  if (
    btn &&
    !armConfirm(btn, {
      label: 'Confirmer',
      message: 'Appuyez de nouveau pour vider la liste des prénoms mémorisés',
    })
  )
    return;
  remove(KEYS.profiles);
  const list = byId('profiles-list');
  list.replaceChildren();
  hide(list);
  refreshNameActions();
  announce('Liste des prénoms mémorisés vidée');
}

/** Mélange aléatoirement les prénoms entre les cases. */
export function shufflePlayers() {
  const inputs = nameInputs();
  const vals = inputs.map((i) => i.value);
  for (let i = vals.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [vals[i], vals[j]] = [vals[j], vals[i]];
  }
  inputs.forEach((inp, i) => {
    inp.value = vals[i];
  });
  refreshNameActions();
  announce('Ordre des joueurs mélangé');
}

/** Vide toutes les cases. */
export function clearNames() {
  nameInputs().forEach((i) => {
    i.value = '';
  });
  lastFocusedInput = null;
  refreshNameActions();
  announce('Cases vidées');
}

/**
 * États vides : un bouton n'est actif que s'il a quelque chose à faire, et la ligne d'aide
 * explique « Mémoriser » tant qu'aucun prénom n'a été gardé.
 */
export function refreshNameActions() {
  const filled = collectNames().filter(Boolean).length;
  const saved = loadProfiles().length;
  byId('shuffle-btn').disabled = filled < 2;
  byId('memorize-btn').disabled = filled === 0;
  byId('clear-profiles-btn').disabled = saved === 0;
  byId('clear-names-btn').disabled = filled === 0;
  byId('profiles-help').hidden = saved > 0;
}

/** Prénoms saisis, dans l'ordre des cases (chaîne vide si absent). */
export function collectNames() {
  return nameInputs().map((i) => i.value.trim().slice(0, currentMaxLen));
}

/** Prénoms saisis, mémorisés pour le préréglage courant (bouton « Lancer » de la page Joueurs). */
export function collectNamesAndRemember() {
  const names = collectNames();
  rememberLastNames(currentPresetKey(), names);
  return names;
}

/** Prénoms du lancement rapide depuis l'accueil : derniers noms du préréglage courant. */
export function quickStartNames() {
  return lastNamesFor(currentPresetKey(), store.config.numPlayers);
}

function nameRow(i, value, maxLen) {
  const id = `name-${i}`;
  const countId = `name-count-${i}`;
  const color = COLORS[i % 12];
  // La couleur du siège passe par une propriété personnalisée : le numéro reste écrit en --text
  // (contraste garanti), la couleur ne porte que l'anneau et la teinte de fond.
  const av = el('span', {
    className: 'name-avatar',
    style: `--seat-color:${color}`,
    'aria-hidden': 'true',
    text: String(i + 1),
  });
  const inp = el('input', {
    className: 'name-input',
    id,
    type: 'text',
    placeholder: `Joueur ${i + 1}`,
    'aria-label': `Prénom du joueur ${i + 1}`,
    'aria-describedby': countId,
    maxLength: maxLen,
    autocomplete: 'off',
    autocapitalize: 'words',
    enterkeyhint: 'next',
    value,
  });
  // Compteur de caractères : la limite se voit, rien n'est tronqué en silence.
  const count = el('span', {
    className: 'name-count',
    id: countId,
    text: `${value.length}/${maxLen}`,
  });
  const updateCount = () => {
    count.textContent = `${inp.value.length}/${maxLen}`;
    count.classList.toggle('is-full', inp.value.length >= maxLen);
  };
  inp.addEventListener('focus', () => {
    lastFocusedInput = inp;
  });
  inp.addEventListener('input', () => {
    updateCount();
    refreshNameActions();
  });
  updateCount();
  inp.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const inputs = nameInputs();
    const next = inputs[inputs.indexOf(inp) + 1];
    if (next) next.focus();
    else byId('names-go-btn').focus();
  });
  return el('div', { className: 'name-row' }, av, inp, count);
}

/** Construit les cases de prénom (préremplies avec les derniers noms du préréglage) et affiche la page. */
export function showNamesScreen() {
  lastFocusedInput = null;
  const list = byId('names-list');
  const n = store.config.numPlayers;
  // La limite de saisie est celle de la plus petite carte de la disposition : un prénom accepté
  // ici est toujours affichable en jeu (source unique : js/core/layout.js).
  currentMaxLen = nameMaxLength(n, window.innerWidth, window.innerHeight);
  const remembered = lastNamesFor(currentPresetKey(), n).map((v) => v.slice(0, currentMaxLen));
  const hint = byId('names-limit');
  hint.textContent =
    currentMaxLen < NAME_MAX_LEN
      ? `À ${n} joueurs sur cet écran, les prénoms sont limités à ${currentMaxLen} caractères pour rester lisibles sur les cartes.`
      : '';
  hint.hidden = currentMaxLen >= NAME_MAX_LEN;
  list.replaceChildren(
    ...Array.from({ length: n }, (_, i) => nameRow(i, remembered[i], currentMaxLen)),
  );
  renderProfileChips();
  refreshNameActions();
  showPage('names-page');
  byId('names-title').focus({ preventScroll: true });
}
