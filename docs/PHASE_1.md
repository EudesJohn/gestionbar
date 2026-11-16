# Livraison de phase 1 — Comptoir

Site : https://gestionbar-amber.vercel.app

Dépôt : https://github.com/EudesJohn/gestionbar

## Périmètre livré

- Personnel : création, date de prise de service, salaire de base administrateur, fin de contrat motivée, historique et dettes conservés.
- Catalogue et inventaire initial ; prix figés sur chaque fiche validée.
- Fiche journalière unique par serveuse/date, cash, Momo, dépenses justifiées, crédits et manquants.
- Dettes, avances, remboursements partiels ou totaux, salaires et reports des soldes non prélevés.
- Comptes : seuls les rôles Administrateur et Gérant sont proposés. Le gérant assure toute la saisie quotidienne. L’administrateur crée les identifiants dans son espace et peut suspendre l’accès.
- Contrôles PostgreSQL, RLS fermant les tables, RPC transactionnelles, journal d’audit et idempotence des commandes.
- Saisie d’une fiche en attente hors connexion, puis validation serveur à la reconnexion. Les conflits restent visibles et ne sont pas écrasés silencieusement.

## Formules et historique

Les nouvelles fiches utilisent : `manquant = valeur reçue − cash − Momo − dépenses − crédit`.

`100 × 500 − 45 000 = 5 000 FCFA` : une dette est rattachée à la serveuse, et le stock ne diminue qu’une fois. Une quantité « vendue » inférieure à la quantité reçue ne diminue pas automatiquement le manquant ; le reste est affiché avec cette explication.

`30 000 − 5 000 = 25 000 FCFA` : le remboursement intégral de la dette avant le paiement rétablit un net de `30 000 FCFA`. Un remboursement après paiement ne peut pas rembourser une dette déjà soldée par la retenue. La limite de retenue est appliquée, et le reste est reporté.

La migration `202611160002_phase1_rules.sql` conserve la formule historique de chaque fiche. Elle doit être exécutée après la première migration. Le site bloque les nouvelles validations tant que le serveur ne fournit pas `calculationVersion = 2`.

Le compte du gérant à trois niveaux appartient à la phase 2 : aucune écriture dans un tel compte n’est actuellement créée. Son invariant financier ne peut pas encore être annoncé comme validé.

## Comptes de test

Le compte administrateur initial a été converti au compte personnel du propriétaire, en conservant son identifiant et son historique. Le gérant fictif reste disponible pour les essais. Les informations de connexion figurent uniquement dans `.local/ACCES_TEST.md`, ignoré par Git et Vercel. Les scripts de préparation ne sont pas exécutés automatiquement à chaque déploiement.

Un nouveau compte public reçoit `pending`, sans lecture des données ni droit d’écriture. L’administrateur attribue le rôle depuis son espace. Les mots de passe ne sont enregistrés ni dans le journal, ni dans la file Dexie.

## Lancer et vérifier

```bash
npm install
npm run dev
npm run build
npm test
npm run test:e2e
```

Vite sert l’interface sur `http://localhost:5173`. Les tests navigateur utilisent un serveur isolé sur le port 5174, avec les données fictives béninoises. `vercel dev` permet de tester aussi `/api/accounts` localement avec les variables serveur.

## Valeurs par défaut

- Un bar à Pobè ; monnaie FCFA et fuseau `Africa/Porto-Novo`.
- Avances : 15 000 FCFA ; dettes : 50 000 FCFA ; retenue : 50 % du salaire de base.
- Crédits autorisés dans le plafond ; les manquants constatés sont enregistrés même au-dessus du plafond.
- Pas de partage automatique de manquant ; correction motivée du gérant tant que la journée est ouverte.
- Salaire mensuel sans prorata automatique ; primes manuelles, aucune commission automatique.
- Le dépôt est un transfert de fonds déjà encaissés.

## Limites et phases suivantes

La connexion utilise une adresse, un mot de passe Supabase et une double authentification TOTP obligatoire après les migrations de sécurité `004` et `005`. Le propriétaire peut modifier ses identifiants dans **Paramètres → Mon compte**. Le PIN de validation des marchandises reste à traiter avec la phase 3. La matrice des permissions par action n’est pas encore personnalisable ; les rôles et les suspensions le sont.

La création des comptes utilise une fonction serveur Vercel. Le déploiement d’une Supabase Edge Function nécessite un accès de gestion Supabase absent de cet environnement ; cette partie de la stack reste à aligner. Les exports Excel existants utilisent ExcelJS : l’alignement sur SheetJS relève de la phase 2.

Fournisseurs, commandes, stocks à trois niveaux et compte du gérant, calendrier complet et rapprochement détaillé de la fiche papier : phase 2. PIN de validation, espace serveuse, photos de fiche, notifications push et hors connexion complet : phase 3. Les sauvegardes automatiques du projet doivent être configurées dans Supabase.

La phase 2 ne commence qu’après validation de cette phase par le promoteur. Les renforcements d’accès demandés ensuite sont détaillés dans `SECURITE.md`.
