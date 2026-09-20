// Tests de démonstration de la chaîne d'outillage (Vitest + jsdom) sur les
// helpers DOM réels du projet (src/dom.ts, périmètre de l'élément B).
// Objectif de ces tests : prouver que `npm test` fonctionne bout en bout sur
// une base sans aucun test préexistant — pas couvrir exhaustivement le
// module (cf. docs/audit/DECISIONS-A.md pour la dette restante).
import { beforeEach, describe, expect, it } from 'vitest';
import { $, $$, $opt, $q } from '../src/dom';

describe('src/dom.ts — accès DOM typés', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="only-one" class="target">A</div>
      <ul id="list">
        <li class="item">1</li>
        <li class="item">2</li>
        <li class="item">3</li>
      </ul>
    `;
  });

  it('$ renvoie l\'élément dont l\'id existe', () => {
    const el = $('only-one');
    expect(el).not.toBeNull();
    expect(el.textContent).toBe('A');
  });

  it('$opt renvoie null quand l\'id est absent', () => {
    expect($opt('does-not-exist')).toBeNull();
  });

  it('$opt renvoie l\'élément quand l\'id existe', () => {
    expect($opt('only-one')?.textContent).toBe('A');
  });

  it('$$ renvoie tous les éléments correspondant au sélecteur, dans l\'ordre du DOM', () => {
    const items = $$('.item');
    expect(items).toHaveLength(3);
    expect(items.map((el) => el.textContent)).toEqual(['1', '2', '3']);
  });

  it('$$ renvoie un tableau vide (jamais null/undefined) quand rien ne correspond', () => {
    expect($$('.nothing-matches')).toEqual([]);
  });

  it('$q renvoie le premier élément correspondant, ou null', () => {
    expect($q('.item')?.textContent).toBe('1');
    expect($q('.nothing-matches')).toBeNull();
  });

  it('$$ et $q acceptent une racine différente de `document`', () => {
    const list = $('list');
    expect($$('.item', list)).toHaveLength(3);
    expect($q('.item', list)?.textContent).toBe('1');
  });
});
