# Sécurité — Comptoir

Ce document décrit les protections vérifiables et leurs limites. Aucune application n’est garantie invulnérable ; la protection du projet Supabase, de Vercel et du compte GitHub reste nécessaire.

## Protections applicatives

| Zone | Protection | Vérification |
|---|---|---|
| Accès aux données | Double authentification TOTP obligatoire (`aal2`) dans PostgreSQL, rôle actif vérifié côté serveur | Un JWT issu du seul mot de passe ne peut ni lire les données ni exécuter une commande |
| Sessions | Session présente dans `auth.sessions`, durée maximale de 8 heures, inactivité de 15 minutes | Tests SQL sur expiration, révocation et rejeu de jeton |
| Retrait d’accès | Suspension ou changement de rôle révoque les sessions métiers existantes | Contrôle avant lecture et avant chaque écriture |
| Création de comptes | Administrateur seulement, session MFA, vérification de l’origine HTTP, JSON borné à 8 Kio, mot de passe de 15 caractères minimum | Tests API : gérant, rôle invalide, origine tierce, session insuffisante |
| Fréquence des appels | Vercel : `/api/` limité à 30 requêtes/minute/IP. PostgreSQL : 10 demandes de création/10 minutes/administrateur | Configuration pare-feu et tests du compteur serveur |
| Identifiants administrateur | Modification de son propre compte, mot de passe actuel requis, MFA, 5 demandes/15 minutes | Aucun identifiant de compte cible accepté dans la requête |
| Changement d’e-mail | Flux Supabase natif : confirmation des adresses selon les réglages Auth | Aucun `email_confirm:true` dans le parcours des paramètres |
| Changement de mot de passe/e-mail | Révocation des sessions métiers par déclencheur sur `auth.users` | Fonctionne aussi pour une modification directe via Supabase Auth |
| Données locales | AES-256-GCM, IV aléatoire par écriture, contexte propriétaire/identifiant authentifié, clé dérivée par PBKDF2-SHA256 (600 000 itérations) | Mauvaise clé, propriétaire différent, texte chiffré altéré et gros volumes testés |
| Déconnexion | Cache synchronisé supprimé et clé locale retirée ; fiches non envoyées conservées chiffrées | La reconnexion est nécessaire pour les déverrouiller |
| Navigateur | CSP sans JavaScript inline ni `eval`, interdiction d’encadrement, HTTPS/HSTS, permissions matérielles désactivées | Vérification des en-têtes et des violations CSP sur le site |
| Argent et stock | Montants entiers, contrôles PostgreSQL, commandes idempotentes, fiches validées protégées, correction inverse et audit | Tests des formules, doublons, droits et écritures interdites |

## Limites du stockage hors connexion

La clé de déchiffrement et les jetons Auth restent dans `sessionStorage` pendant la session de l’onglet ; ils sont donc accessibles au JavaScript de la même origine. Le chiffrement protège une copie des données IndexedDB sans sa clé, pas un appareil compromis, une extension malveillante ou une faille XSS pendant une session ouverte. Il ne remplace pas le verrouillage et le chiffrement du téléphone. La restauration d’onglets par certains navigateurs peut restaurer `sessionStorage` : l’expiration reste vérifiée.

Le retrait d’accès à distance ne peut pas effacer immédiatement un appareil hors connexion. Les écritures sont revérifiées à la synchronisation. Le cache synchronisé est chiffré et limité par la durée de session. Avant un changement de mot de passe, synchroniser les fiches sur tous les appareils : des fiches non synchronisées chiffrées avec l’ancien mot de passe nécessitent encore cet ancien mot de passe pour être récupérées.

Les anciens caches synchronisés en clair sont purgés à la migration IndexedDB. Les anciennes files non synchronisées sont migrées au chiffrement lors de la reconnexion de leur propriétaire, pour éviter toute perte de travail.

## Configuration à terminer par le propriétaire Supabase

1. **Invalider la clé administrative divulguée.** La clé historique `service_role` a été partagée dans la conversation. Elle est exclusivement stockée côté serveur, mais toute personne qui en possède une copie conserve les privilèges correspondants tant qu’elle reste valide. Remplacer le secret Vercel et les fichiers locaux par une nouvelle clé, puis invalider l’ancienne selon le mécanisme de clés/signature Supabase. Créer une nouvelle clé sans invalider l’ancienne ne suffit pas. Vérifier que l’ancienne reçoit `401` après l’opération. Ne pas coller la nouvelle clé dans une conversation.
2. **Désactiver les inscriptions publiques** dans Authentication → Providers/Settings. Les comptes doivent être créés dans l’espace administrateur. Le rôle par défaut `pending` bloque déjà les données, mais ne remplace pas la fermeture de l’inscription publique.
3. **Configurer les protections Auth** : limitations de fréquence, protection contre les mots de passe compromis, SMTP fiable, confirmation de changement d’adresse sur l’ancienne et la nouvelle adresse. Les protections anti-abus des API Supabase sont distinctes de la règle Vercel : le pare-feu Vercel ne protège pas `*.supabase.co`.
4. **Sécuriser les comptes de plateforme** Supabase, Vercel et GitHub avec MFA ; utiliser une clé matérielle/passkey résistante à l’hameçonnage si disponible. Vérifier les accès collaborateurs et protéger la branche de production.
5. **Sauvegardes** : configurer une sauvegarde automatique et la rétention selon l’offre Supabase, exporter périodiquement et réaliser une restauration de contrôle. Aucune sauvegarde planifiée de production n’est annoncée comme configurée par cette livraison.

L’accès Supabase de gestion (ou une connexion SQL) n’est pas disponible dans l’environnement de développement : une clé `service_role` n’est pas un mot de passe SQL ni un jeton de l’API de gestion.

## Migrations et exploitation

Installer dans l’ordre `001`, `002`, `003`, `004_security_hardening`, `005_admin_credentials`. Les scripts déjà appliqués ne doivent pas être rejoués. La connexion échoue volontairement si le RPC de sécurité n’est pas installé.

À la première connexion, l’utilisateur configure une application TOTP sur son téléphone puis saisit le code. Les secrets TOTP de production ne doivent pas être copiés dans le dépôt, les journaux, les captures d’écran ou les mots de passe de test.

Si une ancienne PWA affiche `MFA_REQUIRED` sur le formulaire de connexion, le mot de passe a pu être accepté mais l’ancienne interface ne possède pas l’étape de configuration. La mise à jour de l’écran de connexion doit être chargée. Le bouton « Mettre à jour » est affiché sur les écrans de connexion, de chargement et de double authentification. Une transition unique de service worker récupère les installations antérieures bloquées ; elle ne modifie pas IndexedDB ni les fiches en attente. Les mises à jour suivantes demandent l’action de l’utilisateur.

En cas de perte du téléphone : le propriétaire du projet vérifie l’identité hors application, supprime le facteur perdu via l’administration Supabase, révoque les sessions et fait réenrôler l’utilisateur. Aucun bouton « ignorer la double authentification » n’existe.

La CSP autorise les styles inline nécessaires aux indicateurs et graphiques React ; elle n’autorise pas les scripts inline. Ce n’est pas une preuve d’absence de XSS. Les quatre alertes faibles actuellement signalées par l’audit complet concernent la chaîne de génération PWA ; l’audit de production ne signale pas de vulnérabilité connue à la date du contrôle.

## Vérifier

```bash
npm test
npm run build
npm run test:e2e
npm audit --omit=dev
vercel firewall status
```

Le test MFA contre Supabase est exécuté sur un compte fictif avec un facteur temporaire retiré après vérification. Les tests ne prouvent pas qu’aucune attaque n’est possible ; un audit indépendant avant l’utilisation financière réelle reste utile.

## Retour arrière

- Déploiement : conserver le dernier déploiement stable dans Vercel. Ne pas revenir à une ancienne application qui ignore la MFA tout en réouvrant les RPC pour résoudre une panne.
- Base : sauvegarder avant migration. En cas de panne, le propriétaire conserve le refus d’accès, analyse les erreurs puis applique une migration corrective. Ne pas supprimer les journaux ou les sessions révoquées pour rétablir un accès.
- Pare-feu : la règle `Comptoir API request limit` peut être ajustée ou désactivée puis publiée via Vercel si elle bloque du trafic légitime ; conserver les contrôles MFA et les limites SQL.
- Identifiants divulgués : ne jamais restaurer une clé ou un mot de passe exposé comme solution de retour arrière.
