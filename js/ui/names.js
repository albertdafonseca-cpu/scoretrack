// Page Joueurs : saisie des prénoms (18 caractères max, indépendant de l'écran), profils mémorisés
// accessibles au clavier, mélange, mémoire des derniers noms par préréglage.
import { COLORS } from '../core/constants.js';
import { KEYS, parseProfiles, serializeProfiles, addProfiles } from '../core/save-schema.js';
import { readJSON, writeJSON, remove } from '../platform/storage.js';
import { store } from '../store.js';
import { announce } from './a11y.js';
import { byId, el, qsa, show, hide, showPage, icon } from './dom.js';
import { lastNamesFor, rememberLastNames } from './settings.js';
import { currentPresetKey } from './setup.js';

/** Longueur maximale d'un prénom : constante, l'écran de jeu adapte la taille du texte. */
export const NAME_MAX_LEN = 18;

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
  target.value = name.slice(0, NAME_MAX_LEN);
  const idx = inputs.indexOf(target);
  announce(`${name} placé en joueur ${idx + 1}`);
  // Case suivante prête à recevoir le prochain profil
  lastFocusedInput = inputs[idx + 1] || null;
}

function deleteProfile(name) {
  const profiles = loadProfiles().filter((p) => p !== name);
  writeJSON(KEYS.profiles, serializeProfiles(profiles));
  renderProfileChips();
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
  del.addEventListener('click', () => deleteProfile(name));
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
  announce(
    `${names.length} prénom${names.length > 1 ? 's' : ''} mémorisé${names.length > 1 ? 's' : ''}`,
  );
}

/** Supprime tous les profils mémorisés. */
export function clearSavedNames() {
  remove(KEYS.profiles);
  const list = byId('profiles-list');
  list.replaceChildren();
  hide(list);
  announce('Prénoms mémorisés oubliés');
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
  announce('Ordre des joueurs mélangé');
}

/** Vide toutes les cases. */
export function clearNames() {
  nameInputs().forEach((i) => {
    i.value = '';
  });
  lastFocusedInput = null;
  announce('Cases vidées');
}

/** Prénoms saisis, dans l'ordre des cases (chaîne vide si absent). */
export function collectNames() {
  return nameInputs().map((i) => i.value.trim().slice(0, NAME_MAX_LEN));
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

function nameRow(i, value) {
  const id = `name-${i}`;
  const color = COLORS[i % 12];
  const av = el('span', {
    className: 'name-avatar',
    style: `color:${color};border-color:${color}`,
    'aria-hidden': 'true',
    text: String(i + 1),
  });
  const inp = el('input', {
    className: 'name-input',
    id,
    type: 'text',
    placeholder: `Joueur ${i + 1}`,
    'aria-label': `Prénom du joueur ${i + 1}`,
    maxLength: NAME_MAX_LEN,
    autocomplete: 'off',
    autocapitalize: 'words',
    enterkeyhint: 'next',
    value,
  });
  inp.addEventListener('focus', () => {
    lastFocusedInput = inp;
  });
  inp.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const inputs = nameInputs();
    const next = inputs[inputs.indexOf(inp) + 1];
    if (next) next.focus();
    else byId('names-go-btn').focus();
  });
  return el('div', { className: 'name-row' }, av, inp);
}

/** Construit les cases de prénom (préremplies avec les derniers noms du préréglage) et affiche la page. */
export function showNamesScreen() {
  lastFocusedInput = null;
  const list = byId('names-list');
  const n = store.config.numPlayers;
  const remembered = lastNamesFor(currentPresetKey(), n);
  list.replaceChildren(...Array.from({ length: n }, (_, i) => nameRow(i, remembered[i])));
  renderProfileChips();
  showPage('names-page');
  byId('names-title').focus({ preventScroll: true });
}
