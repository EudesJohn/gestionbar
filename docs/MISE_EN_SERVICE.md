# Mise en service — projet gestionbar

Le site déployé utilise le projet Supabase `aypxutnxsboyqulzlsyz`. La configuration publique est enregistrée dans Vercel ; les fichiers `.env*` privés ne sont pas versionnés ni envoyés lors du déploiement.

## 1. Initialiser la base

Ouvrir [SQL Editor Supabase](https://supabase.com/dashboard/project/aypxutnxsboyqulzlsyz/sql/new). Sur un projet vierge, exécuter les migrations `001` à `005` dans l’ordre de leurs noms. Les migrations `004_security_hardening` et `005_admin_credentials` ajoutent la double authentification obligatoire, les sessions limitées, les compteurs de tentatives et la modification sécurisée des identifiants. Exécuter seulement les fichiers encore absents : ces scripts ne sont pas à rejouer sur une base déjà initialisée.

La clé publique `anon` et la clé `service_role` ne sont pas des identifiants SQL. L’automatisation d’une migration nécessite une connexion PostgreSQL ou un accès à l’API de gestion Supabase.

## 2. Créer le compte administrateur

Dans [Authentication → Users](https://supabase.com/dashboard/project/aypxutnxsboyqulzlsyz/auth/users), créer le compte avec l’adresse e-mail souhaitée et un mot de passe défini dans Supabase. Ne pas publier le mot de passe dans le code, GitHub ou une conversation.

Copier l’identifiant UUID du compte. Dans SQL Editor, remplacer la valeur ci-dessous et exécuter :

```sql
update public.profiles
set role = 'admin', name = 'Eudes Johnson DJOGO'
where id = 'UUID_DU_COMPTE';
```

Vérifier que la mise à jour affecte une ligne. Le compte peut ensuite se connecter au site. Un nouveau compte reçoit le rôle `pending` et ne peut lire ni écrire les données du bar tant qu’un administrateur ne lui attribue pas un rôle.

Pour tous les autres utilisateurs, l’administrateur utilise **Paramètres → Comptes & rôles → Créer un compte** dans l’application. Il définit le nom, l’adresse de connexion, le mot de passe et le rôle. Il peut ensuite suspendre un accès ou changer son rôle au même endroit. L’API serveur exige la variable secrète `SUPABASE_SERVICE_ROLE_KEY` dans Vercel ; elle ne doit jamais porter de préfixe `VITE_`.

L’administrateur modifie ses propres identifiants dans **Paramètres → Mon compte** : mot de passe actuel et session avec double authentification requis. Le changement d’adresse conserve le flux de confirmation Supabase. Un changement confirmé d’e-mail ou de mot de passe révoque les sessions métiers existantes. Aucun compte cible ne peut être transmis à cette API.

## 3. Configurer les données réelles

Le projet connecté démarre sans les données fictives du mode démonstration. Renseigner le nom du bar, le personnel, les prix et conditionnements réels ainsi que l’inventaire de départ. Confirmer les règles de dépôt, de crédit et de salaire affichées dans les paramètres.

## 4. Remplacer la clé administrative exposée

Une ancienne clé JWT `service_role` a été partagée pendant la configuration. Elle est utilisée exclusivement côté serveur pour les comptes, stockée comme Secret dans Vercel, et n’apparaît pas dans Git ni dans le bundle du navigateur. Son invalidation doit être effectuée dans **Settings → API Keys / JWT Keys**, puis la variable serveur doit être remplacée dans Vercel. Une clé JWT historique dépend de la clé de signature : créer une nouvelle clé seule n’invalide pas forcément l’ancienne. Si la clé publique change lors de la rotation, mettre aussi à jour `VITE_SUPABASE_ANON_KEY` et redéployer.

## 5. Vérifier le service connecté

- Connexion de l’administrateur et du gérant avec leurs droits respectifs. Le gérant assure toute la saisie quotidienne.
- Création d’une fiche et apparition des chiffres sur un second appareil.
- Création d’une dette et remboursement partiel ; calcul cohérent du salaire.
- Saisie hors connexion d’une fiche puis reconnexion ; validation serveur ou refus explicite si un conflit est détecté.
- Clôture de journée, export PDF et Excel.
- Installation de la PWA et vérification sur un vrai téléphone Android.

Les calculs SQL sont testés avec PostgreSQL via PGlite ; les parcours navigateur de démonstration sont testés avec Playwright. Ces tests ne remplacent pas la vérification du projet Supabase hébergé après la migration et la création des comptes.

Les PIN, les photos des fiches, les sauvegardes planifiées, le planning calendaire complet et les envois automatiques WhatsApp/push restent à implémenter ou configurer. Les invendus sont visibles sur leur fiche d’origine ; leur report et leur retour physique au stock ne disposent pas encore d’un parcours dédié.
