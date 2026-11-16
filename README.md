# Comptoir — gestion de bar

Application web mobile-first pour suivre les ventes, le stock, les dettes, les manquants et les salaires du bar de Pobè.

## Démarrer en local

```bash
npm install
npm run dev
```

Ouvrez `http://localhost:5173`. Sans variables Supabase, l’application démarre en **mode démonstration** avec des données fictives conservées dans IndexedDB. Les boutons et les formulaires permettent de parcourir les parcours métier avant de connecter un établissement.

Vérifications disponibles :

```bash
npm run build       # build Vite + génération de la PWA
npm test            # invariants métier + tests PostgreSQL PGlite
npm run test:e2e    # parcours desktop et mobile avec Playwright
```

## Activer Supabase

1. Créez un projet Supabase.
2. Exécutez les fichiers de `supabase/migrations` dans l’ordre, de `202611160001_comptoir.sql` à `202611160005_admin_credentials.sql`. Sur une base existante, exécutez uniquement les migrations encore absentes.
3. Créez le premier compte dans **Authentication → Users**.
4. Donnez-lui le rôle `admin` dans `public.profiles` :

```sql
update public.profiles
set role = 'admin', name = 'Eudes Johnson'
where id = 'UUID_DU_COMPTE';
```

5. Copiez `.env.example` vers `.env.local` et renseignez l’URL du projet ainsi que la clé publique anon :

```env
VITE_SUPABASE_URL=https://votre-projet.supabase.co
VITE_SUPABASE_ANON_KEY=votre-cle-publique
```

6. Redémarrez Vite. La saisie passe alors par les RPC transactionnelles `get_snapshot` et `apply_command` ; les tables financières ne sont pas accessibles directement au navigateur.

## Règles implémentées

- Les montants sont des entiers FCFA.
- Deux rôles actifs : Administrateur et Gérant. Le gérant assure toute la gestion quotidienne, y compris la saisie des fiches. `pending` représente un compte en attente ou suspendu.
- Une seule fiche validée par serveuse et par date.
- La remise de marchandise est rattachée à la serveuse et sort du stock une seule fois.
- Le manquant est calculé sur la valeur de la marchandise prise, moins cash, Momo, dépenses justifiées et crédits clients. Le reste déclaré ne diminue pas automatiquement la dette.
- Les fiches historiques gardent la formule utilisée lors de leur validation.
- Un manquant et une vente à crédit créent une dette rattachée à la serveuse.
- Un remboursement réduit le même solde que la retenue salariale.
- La retenue mensuelle est plafonnée par le paramètre de l’établissement ; le reliquat est reporté.
- Une fiche validée reste dans l’historique. Sa correction passe par une écriture inverse avec motif.
- La clôture verrouille la journée et empêche les corrections ultérieures.
- Les commandes synchronisées sont idempotentes grâce à un identifiant de commande.
- Le journal d’audit et les mouvements financiers sont protégés côté PostgreSQL.

## Points à confirmer avant exploitation réelle

Les hypothèses visibles dans **Paramètres → Établissement** doivent être confirmées avec le promoteur : définition du dépôt, formule exacte de la différence de la fiche papier, plafond de retenue, prorata d’un mois incomplet, autorisation et plafond des crédits clients, et éventuelles primes ou commissions.

Le récapitulatif de journée peut être partagé depuis l’écran de clôture. L’envoi WhatsApp automatique et les notifications push sont prévus pour une phase ultérieure ; le bouton de partage ouvre le récapitulatif prêt à envoyer.

## Déploiement

Le projet est préparé pour Vercel :

```bash
npm run build
```

Ajoutez les deux variables `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` dans les variables d’environnement Vercel. `vercel.json` conserve le routage de la PWA et ajoute quelques en-têtes de protection.

Pour permettre à l’administrateur de créer les autres comptes depuis **Paramètres → Comptes & rôles**, configurez `SUPABASE_SERVICE_ROLE_KEY` comme **Secret** côté serveur Vercel. Aucun préfixe `VITE_` ne doit être ajouté à cette variable. `api/accounts.ts` vérifie la session Supabase et le rôle courant avant d’appeler l’API Auth ; la base revalide l’administrateur lors de l’attribution du rôle. Cette route est disponible avec `vercel dev` ou sur Vercel, pas avec le serveur Vite seul.

Le détail de cette livraison et les limites connues figurent dans [docs/PHASE_1.md](docs/PHASE_1.md).

La connexion utilise maintenant une double authentification TOTP, des sessions limitées et un cache local chiffré. Les identifiants du propriétaire se modifient dans **Paramètres → Mon compte**, réservé à l’administrateur. Lire [docs/SECURITE.md](docs/SECURITE.md) pour les protections, les réglages Supabase restant à effectuer et le plan de récupération.
