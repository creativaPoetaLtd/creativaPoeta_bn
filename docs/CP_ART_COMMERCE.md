# CP Art — livraison, paiements et commandes

## État et principes

Les prix affichés sont TTC, selon la demande du vendeur. Aucun taux de TVA n’est présumé. Les frais sont saisis par le vendeur ; une valeur vide reste inconnue, et seul un zéro explicite signifie gratuit. La configuration initiale est vide, avec les paiements désactivés. Aucun compte Stripe ou imprimeur n’a été créé ou configuré, et aucun déploiement n’est inclus dans cette étape.

L’intégration prépare des sessions Stripe Checkout hébergées. Les tests locaux simulent Stripe, y compris les notifications signées ; ils ne remplacent pas un essai sur le compte Stripe de test du vendeur avant ouverture réelle.

## Administration

- `art:settings` : réglages de livraison et de paiement.
- `art:orders` : consultation des commandes et suivi de préparation/livraison.
- `art:catalog` : attribution d’un profil de livraison à chaque variante ; cet accès n’autorise pas la modification des réglages de paiement.

Les profils distinguent les fabrications de l’atelier et des partenaires. Chaque profil contient des zones UE sans chevauchement de pays, puis des modes de livraison nommés avec frais TTC et délais de transport facultatifs. Le calcul est `premier article + (quantité du profil − 1) × article supplémentaire`. Les frais de profils distincts s’additionnent. Utiliser des profils distincts lorsqu’un support, un format ou un fournisseur nécessite un autre calcul. Ne regrouper dans un profil que les articles pour lesquels cette règle de frais convient réellement.

Une variante sans profil utilisable, un pays absent de ses zones ou un mode sans tarif empêche le paiement de toute la sélection. Les demandes non contractuelles à l’atelier restent possibles. La préparation de l’œuvre et le transport sont affichés séparément.

## Routes supplémentaires sous `/api/art`

| Route | Accès | Fonction |
| --- | --- | --- |
| GET/PUT `/admin/settings` | `art:settings` | Configuration versionnée et état des conditions techniques d’ouverture |
| GET `/admin/shipping-profiles` | `art:catalog` | Identifiants, noms et types des profils uniquement |
| POST `/checkout` | Public | Prix/livraison recalculés, conditions acceptées, création idempotente d’une session Stripe |
| POST `/orders/status` | Référence + jeton privé de 32 octets | État minimal du paiement et de la livraison ; aucune adresse client |
| GET `/admin/orders` | `art:orders` | 200 commandes les plus récentes, coordonnées nécessaires au traitement |
| PATCH `/admin/orders/:id` | `art:orders` | Préparation, suivi HTTPS et note interne ; aucune modification du statut financier |
| POST `/stripe/webhook` | Signature Stripe sur corps brut | Paiement, expiration, échec différé et remboursements |

Le total et les conditions affichés sont liés à une empreinte calculée par le serveur. Un changement impose une nouvelle confirmation. Les commandes conservent un instantané immuable des prix, de la livraison et de la version des conditions. Les identifiants de répétition sont liés à leur contenu et à l’accès privé. Les confirmations ne reposent jamais sur une URL de succès ou sur une donnée de montant envoyée par le navigateur.

Les secrets Stripe restent dans les variables serveur. Les liens et identifiants privés des sessions ne sont pas retournés par la liste d’administration. L’audit des commandes enregistre les références, les états, les montants et les versions sans recopier les liens privés, les jetons ou les coordonnées clients. Les commandes ne peuvent pas être supprimées physiquement.

## Préparer le compte Stripe

1. Configurer les informations du vendeur, les conditions publiques, les reçus Stripe et Stripe Tax selon le régime fiscal et les immatriculations confirmés avec le comptable. Le code fiscal produit est global au catalogue dans cette version : son utilisation doit convenir à toutes les variantes mises en vente. Si plusieurs classifications sont nécessaires, les ajouter par variante avant ouverture de ces ventes.
2. Renseigner les tarifs réels, les pays de chaque variante et les profils adaptés. Les coûts POD ne sont pas récupérés automatiquement chez un fournisseur.
3. Fournir côté serveur les variables `ART_STRIPE_TEST_SECRET_KEY` et `ART_STRIPE_TEST_WEBHOOK_SECRET`, puis `ART_PUBLIC_ORIGIN` correspondant exactement à l’origine du frontend. Aucune clé ne doit être préfixée `VITE_`.
4. Configurer un endpoint Stripe **snapshot** `/api/art/stripe/webhook` avec la version API `2026-10-28.endive`, correspondant au SDK installé, et les événements suivants : `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`. Les anciens formats d’événements ne constituent pas la configuration prise en charge.
5. Passer le studio en mode test et renseigner le code fiscal, l’adresse/version des conditions et les confirmations de préparation. Définir `ART_CHECKOUT_ENABLED=true` côté serveur. Faire un paiement et un remboursement avec le compte Stripe **de test**. Les essais automatisés de ce dépôt restent des simulations.
6. Après validation, configurer séparément les secrets live et leur endpoint, sélectionner le mode production dans le studio et définir `ART_LIVE_PAYMENTS_ENABLED=true`. Ces deux autorisations serveur sont fermées par défaut.

Stripe reçoit des prix et frais `tax_behavior: inclusive` avec `automatic_tax` activé : la taxe est comprise dans les montants affichés. La classification fiscale et les enregistrements Stripe Tax restent à configurer ; une case dans le studio ne vérifie pas le compte Stripe à distance. Cette intégration n’implémente pas les factures fiscales ni la transmission automatique des commandes aux imprimeurs. Le suivi des commandes et les fabrications restent manuels ; les reçus Stripe doivent être activés et vérifiés sur le compte.

## Notifications et incidents

Le webhook vérifie les octets bruts capturés par Express, puis l’environnement, la session, la référence, le montant EUR, le pays et l’acceptation des conditions avant de confirmer un paiement. Un écart place la commande en vérification et suspend la préparation. Les événements répétés sont ignorés ; les écritures concurrentes déclenchent une réponse non 2xx pour permettre la répétition par Stripe. Un événement tardif ne remplace pas un remboursement par un statut payé. Les remboursements reçus avant le paiement sont rapprochés via les métadonnées du PaymentIntent récupérées chez Stripe.

Désactiver les nouveaux paiements ne coupe pas le webhook : conserver les secrets et les clés des deux environnements pour rapprocher les paiements existants. Un paiement remboursé ou à vérifier ne peut pas être marqué en préparation ou expédié par l’API. Les remboursements sont exécutés dans Stripe, puis enregistrés ici par notification ; aucun bouton de remboursement n’est ajouté au studio. Traiter les écarts de rapprochement dans Stripe et dans un processus de support avant de reprendre une fabrication.

## Vérifications locales

`npm.cmd test` compile aussi les fichiers `dist` suivis par Git. Les tests métier couvrent les frais inconnus, les frais nuls explicites, les profils mixtes, les choix de livraison et les validations de configuration.

Le serveur `scripts/art-qa-server.cjs` crée exclusivement sa propre base temporaire sur localhost. `CP_ART_QA_COMMERCE=true` y charge `scripts/art-stripe-qa.cjs`, un simulateur non importé par le code applicatif, avec des secrets fictifs. Les seuls endpoints `__qa` appartiennent à ce serveur de test, jamais à `src/app.ts`. Ne pas déployer ce serveur.

Après démarrage local : `node scripts/verify-art-api.cjs`, puis `node scripts/verify-art-commerce.cjs`. Le frontend possède aussi un parcours navigateur `scripts/verify-art-commerce.cjs` raccordé aux ports 5185/5190 et utilisant uniquement les données temporaires.

Références techniques : [Stripe Checkout et confirmation des paiements](https://docs.stripe.com/checkout/fulfillment), [Stripe Tax avec Checkout](https://docs.stripe.com/tax/checkout/page), [vérification des signatures](https://docs.stripe.com/events/manage-webhook-endpoints#signature-errors).
