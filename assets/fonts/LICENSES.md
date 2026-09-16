# Polices auto-hébergées — licences et provenance

Toutes les polices de ce dossier sont distribuées sous **SIL Open Font License 1.1 (OFL-1.1)**,
qui autorise l'usage, l'embarquement et la redistribution (y compris commerciale) à condition de
ne pas vendre les fichiers de police seuls et de conserver la mention de copyright.
Texte de la licence : https://openfontlicense.org/open-font-license-official-text/

Fichiers récupérés depuis le CDN Google Fonts (fonts.gstatic.com) par `scripts/fetch-fonts.mjs`,
sous-ensembles **latin** et **latin-ext** uniquement, format WOFF2. Les URL d'origine exactes sont
consignées en commentaire dans `css/fonts.css`. Les fichiers ne sont pas modifiés.

| Famille | Graisses embarquées | Fichiers | Auteur / copyright | Version Google Fonts | Source amont |
|---|---|---|---|---|---|
| Orbitron | 400–900 (variable) | `orbitron-400-900-latin.woff2` (pas de sous-ensemble latin-ext publié) | Matt McInerney (The League of Moveable Type) | v35 | https://github.com/theleagueof/orbitron |
| Share Tech Mono | 400 | `share-tech-mono-400-latin.woff2` (pas de sous-ensemble latin-ext publié) | Carrois Type Design (Ralph du Carrois) | v16 | https://fonts.google.com/specimen/Share+Tech+Mono |
| Inter | 400–800 (variable) | `inter-400-800-latin.woff2`, `inter-400-800-latin-ext.woff2` | Rasmus Andersson (The Inter Project Authors) | v20 | https://github.com/rsms/inter |
| Press Start 2P | 400 | `press-start-2p-400-latin.woff2`, `press-start-2p-400-latin-ext.woff2` | Cody « CodeMan38 » Boisclair | v16 | https://github.com/codeman38/PressStart2P |
| Cinzel | 400–700 (variable) | `cinzel-400-700-latin.woff2`, `cinzel-400-700-latin-ext.woff2` | Natanael Gama (NDISCOVER) | v26 | https://github.com/NDISCOVER/Cinzel |
| Bebas Neue | 400 | `bebas-neue-400-latin.woff2`, `bebas-neue-400-latin-ext.woff2` | Ryoichi Tsunekawa (Dharma Type) | v16 | https://github.com/dharmatype/Bebas-Neue |

Poids total : ≈ 238 Ko (10 fichiers). Orbitron, Inter et Cinzel sont servies par Google comme
polices variables : un seul fichier couvre toutes les graisses demandées, déclaré avec une plage
`font-weight: min max`.

Pour mettre à jour : `node scripts/fetch-fonts.mjs` (régénère ce dossier et `css/fonts.css`).
