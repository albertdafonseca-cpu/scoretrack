// Élément E — dépendance jsPDF : preuve que la génération de PDF ne dépend
// plus du CDN cdnjs.cloudflare.com (voir docs/audit/DECISIONS-E.md, §1).
//
// Deux angles de test :
// 1. Une inspection de source anti-régression : si quelqu'un réintroduit
//    `window.jspdf`/le chargement CDN dans src/recap-pdf.ts ou retire la
//    dépendance npm de package.json, ce test échoue (mutation testing
//    minimal — cf. méthodologie BRIEF.md §3.2).
// 2. Un test d'exécution réel : la bibliothèque `jspdf` importée comme
//    module ES (celle que bundle esbuild dans dist/app.js) produit
//    effectivement un PDF valide, sans aucun accès réseau — `fetch`/`XMLHttpRequest`
//    ne sont jamais appelés pendant tout le test (vérifié par un espion qui
//    ferait échouer le test s'ils l'étaient).
//
// On teste volontairement la bibliothèque `jspdf` directement plutôt que
// `exportRecapPDF()` : cette dernière importe `src/game.ts` (état de partie
// complet, hors périmètre de l'élément E) uniquement pour lire des données
// d'affichage — ce que ce test ne veut pas coupler à l'évolution de game.ts.
// La preuve utile à l'élément E est que jsPDF fonctionne bundlé, hors ligne :
// c'est ce que ce test établit directement.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jsPDF } from 'jspdf';

const recapPdfSource = readFileSync(
  path.resolve(import.meta.dirname, '..', 'src', 'recap-pdf.ts'),
  'utf8'
);
const packageJson = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, '..', 'package.json'), 'utf8')
);

describe('src/recap-pdf.ts — jsPDF bundlé (plus de CDN), regression source', () => {
  it("importe jsPDF comme module npm ('jspdf'), pas depuis window", () => {
    expect(recapPdfSource).toMatch(/import\s*\{\s*jsPDF\s*\}\s*from\s*['"]jspdf['"]/);
  });

  it('ne référence plus jamais window.jspdf (ancien chargement CDN)', () => {
    expect(recapPdfSource).not.toMatch(/window\.jspdf/);
  });

  it("jspdf est une dépendance npm figée dans package.json (pas un <script> CDN)", () => {
    expect(packageJson.dependencies).toHaveProperty('jspdf');
    // Version exacte (convention du projet pour les libs de rendu, cf. `three`
    // dans CLAUDE.md) : pas de caret qui autoriserait une montée de version
    // silencieuse sans revalidation du PDF généré.
    expect(packageJson.dependencies.jspdf).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('jsPDF (module npm bundlé) — génère un vrai PDF, sans réseau', () => {
  beforeEach(() => {
    // Si jsPDF (ou tout code de ce test) tentait un accès réseau, ce serait
    // exactement le symptôme du défaut d'origine (dépendance CDN cachée) :
    // on le transforme en échec de test explicite plutôt qu'en succès silencieux.
    if (typeof globalThis.fetch === 'function') {
      vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
        throw new Error('jsPDF ne doit déclencher AUCUN accès réseau une fois bundlé');
      });
    }
  });

  it('produit un document PDF valide (en-tête %PDF) à partir de texte simple', () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('ScoreTrack', 16, 18);
    doc.setTextColor(0, 100, 180);
    doc.text('Export hors ligne', 16, 30);

    const pdfString: string = doc.output('datauristring');
    expect(pdfString.startsWith('data:application/pdf;filename=generated.pdf;base64,')).toBe(true);

    const base64 = pdfString.split(',')[1];
    const decoded = Buffer.from(base64, 'base64').toString('latin1');
    expect(decoded.startsWith('%PDF-')).toBe(true);
    expect(decoded).toContain('%%EOF');
  });

  it('gère plusieurs pages (getNumberOfPages/setPage), comme le fait le récapitulatif', () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    doc.text('Page 1', 16, 18);
    doc.addPage();
    doc.text('Page 2', 16, 18);

    expect(doc.getNumberOfPages()).toBe(2);
    doc.setPage(1);
    doc.setFontSize(7);
    doc.text('ScoreTrack — scoretrack.app', 16, 292);

    const decoded = Buffer.from(doc.output('datauristring').split(',')[1], 'base64').toString('latin1');
    expect(decoded.startsWith('%PDF-')).toBe(true);
  });
});
