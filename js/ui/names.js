// Page Joueurs : saisie des prénoms, profils mémorisés, mélange.
import { COLORS } from '../core/constants.js';
import { nameMaxLength } from '../core/layout.js';
import { KEYS, parseProfiles, serializeProfiles, addProfiles } from '../core/save-schema.js';
import { readJSON, writeJSON, remove } from '../platform/storage.js';
import { store } from '../store.js';
import { byId, el, qsa, show, hide, showPage, icon } from './dom.js';

let lastFocusedInput = null;

const nameInputs = () => qsa('.name-input');

/** Prénoms mémorisés (liste vide si aucun). */
export function loadProfiles() {
  return parseProfiles(readJSON(KEYS.profiles, []));
}

function fillName(name) {
  const inputs = nameInputs();
  // Utiliser la dernière case explicitement cliquée/focalisée
  if (lastFocusedInput && inputs.includes(lastFocusedInput)) {
    lastFocusedInput.value = name;
    lastFocusedInput.focus();
    return;
  }
  // Sinon première case vide
  const empty = inputs.find((inp) => !inp.value.trim());
  if (empty) {
    empty.value = name;
    empty.focus();
  }
}

function deleteProfile(name) {
  const profiles = loadProfiles().filter((p) => p !== name);
  writeJSON(KEYS.profiles, serializeProfiles(profiles));
  renderProfileChips();
}

function profileChip(name) {
  const del = el('span', { className: 'profile-chip-del' }, icon('close', '✕'));
  del.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteProfile(name);
  });
  const chip = el('div', { className: 'profile-chip' }, el('span', { text: name }), del);
  chip.addEventListener('click', () => fillName(name));
  return chip;
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
  const names = nameInputs()
    .map((i) => i.value.trim())
    .filter(Boolean);
  if (!names.length) return;
  writeJSON(KEYS.profiles, serializeProfiles(addProfiles(loadProfiles(), names)));
  renderProfileChips();
}

/** Supprime tous les profils mémorisés. */
export function clearSavedNames() {
  remove(KEYS.profiles);
  const list = byId('profiles-list');
  list.replaceChildren();
  hide(list);
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
}

/** Vide toutes les cases. */
export function clearNames() {
  nameInputs().forEach((i) => {
    i.value = '';
  });
}

/** Prénoms saisis, dans l'ordre des cases (chaîne vide si absent). */
export function collectNames() {
  return nameInputs().map((i) => i.value.trim());
}

/** Construit les cases de prénom pour le nombre de joueurs choisi et affiche la page. */
export function showNamesScreen() {
  lastFocusedInput = null;
  const list = byId('names-list');
  list.replaceChildren();
  const n = store.config.numPlayers;
  const maxLen = nameMaxLength(n, window.innerWidth, window.innerHeight);

  for (let i = 0; i < n; i++) {
    const av = el('div', {
      className: 'name-avatar',
      style: `color:${COLORS[i % 12]};border-color:${COLORS[i % 12]}`,
      text: String(i + 1),
    });
    const inp = el('input', {
      className: 'name-input',
      type: 'text',
      placeholder: `Joueur ${i + 1}`,
      maxLength: maxLen,
      autocomplete: 'off',
    });
    inp.addEventListener('focus', () => {
      lastFocusedInput = inp;
    });
    inp.addEventListener(
      'touchstart',
      () => {
        lastFocusedInput = inp;
      },
      { passive: true },
    );
    list.appendChild(el('div', { className: 'name-row' }, av, inp));
  }
  renderProfileChips();
  showPage('names-page');
}
