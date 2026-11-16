# Graphiques et nom du compte administrateur

## Nom affiché

Dans **Paramètres → Mon compte → Nom de l’administrateur**, l’administrateur peut modifier son propre nom (2 à 150 caractères). La session avec double authentification est vérifiée par le serveur. La cible est toujours le compte connecté ; il n’est pas possible de transmettre l’identifiant d’un autre compte.

Le nom est enregistré dans `profiles.name`, la source utilisée par l’en-tête, le message de bienvenue et la liste des comptes. Le déclencheur d’audit existant conserve l’ancienne et la nouvelle valeur. Un changement de nom ne modifie pas les identifiants de connexion. Aucune nouvelle migration SQL n’est nécessaire.

## Vues graphiques

Le tableau de bord comporte huit vues :

- courbe des ventes et comparaison à la période précédente ;
- anneau des encaissements cash / Mobile Money ;
- classement des ventes par produit ;
- classement des ventes par serveuse ;
- courbes de marge brute et de dépenses ;
- courbes des manquants et des crédits clients ;
- anneau des dettes restant dues ;
- barres de stock avec repère de seuil d’alerte.

Les rapports ajoutent trois vues : histogramme cash / Mobile Money, calendrier d’activité et anneau des ventes par catégorie. Les filtres permettent d’afficher le jour, les sept derniers jours, le mois courant jusqu’à la date choisie ou les 90 derniers jours. Les courbes peuvent être regroupées par jour, semaine calendaire (lundi–dimanche) ou mois.

Les valeurs d’un graphique se consultent au survol, au toucher ou avec les flèches du clavier. Les séries peuvent être masquées avec leur légende, en conservant toujours une série visible. « Voir les chiffres » expose les valeurs sous forme de tableau.

## Signification des chiffres

- Seules les fiches validées alimentent les ventes. Les fiches annulées sont exclues.
- Les prix d’achat et de vente historiques des lignes sont utilisés, même si le catalogue a changé.
- La comparaison utilise exactement le même nombre de jours immédiatement avant la période sélectionnée.
- Un jour sans fiche est affiché à zéro ; le calendrier le distingue d’un jour enregistré sans ventes. La moyenne par jour utilise uniquement les jours avec au moins une fiche.
- Une serveuse dont le contrat est terminé reste visible dans ses résultats historiques.
- La marge brute peut être négative. Elle ne représente pas le bénéfice net : salaires, charges fixes et pertes d’inventaire sont exclus.
- Les graphiques « Dettes encore dues » et « Réserve & seuils de stock » affichent l’état actuel toutes dates confondues, indépendamment du filtre historique. Cette distinction est indiquée dans leur titre ou leur description.
- Une période vide affiche un état sans données. Les données de démonstration restent séparées de la base réelle.

## Vérification

```bash
npm test
npm run build
npm run test:e2e
```

Les tests analytiques couvrent les annulations, les prix historiques, les périodes précédentes, les limites de mois et de semaine, les dates invalides, les périodes vides et les soldes après remboursement. Les parcours navigateur couvrent les filtres, les légendes, les valeurs au clavier, le calendrier et l’absence de débordement horizontal au format téléphone.
