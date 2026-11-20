# CP Art — catalogue et demandes

Le module est monté sous `/api/art`. Les demandes restent non contractuelles. La nouvelle intégration de livraison, Stripe et commandes est décrite dans [CP_ART_COMMERCE.md](CP_ART_COMMERCE.md) ; les paiements sont désactivés par défaut et aucun envoi automatique à un imprimeur n’est effectué.

## Routes

| Méthode et chemin | Usage | Accès |
| --- | --- | --- |
| GET `/catalog` | Œuvres publiées et variantes disponibles, sans référence fournisseur | Public |
| POST `/quote` | Vérification des œuvres, quantités, prix actuels et pays ; sous-total hors livraison à confirmer | Public |
| POST `/requests` | Enregistrement d’une demande non contractuelle avec consentement et référence | Public |
| GET/POST `/admin/artworks` | Liste privée et création d’œuvres | `art:catalog` |
| PATCH `/admin/artworks/:id` | Modification, publication ou archivage avec version attendue | `art:catalog` |
| POST `/admin/translate` | Traduction de champs éditoriaux FR vers EN ou NL, sans enregistrement de fiche | `art:catalog` |
| POST `/admin/images` | Photo de présentation JPEG/PNG/WebP, 3 Mo maximum | `art:catalog` |
| GET `/admin/requests` | Demandes clients privées | `art:requests` |
| PATCH `/admin/requests/:id` | Suivi et note interne avec version attendue | `art:requests` |

Toutes les routes d’administration passent par l’authentification et la vérification des permissions existantes. Les réponses du module utilisent `Cache-Control: no-store`.

## Données

`ArtArtwork` conserve le contenu éditorial multilingue, les photographies ordonnées et les variantes en EUR. `collectionSlug` est le nom du champ MongoDB, exposé comme `collection` par l’API. Les prix sont des entiers en centimes. Une publication nécessite une histoire française, une photo décrite et une variante disponible et chiffrée. Les pays initiaux sont ceux de l’Union européenne.

`ArtRequest` conserve les coordonnées nécessaires à une réponse, le consentement horodaté, la sélection et l’instantané des prix calculés par le serveur. Les nouvelles requêtes sont validées à partir du catalogue publié et des variantes disponibles. Le client ne peut pas fournir un montant faisant autorité ou un statut payé. Les références de répétition sont liées au contenu de la demande pour éviter les doublons et les réutilisations silencieuses.

Les modèles utilisent les protections d’audit, de suppression physique et de concurrence du projet. Aucun endpoint de suppression n’est ajouté. Les références privées des imprimeurs restent dans le catalogue d’administration.

## Images et paramètres

Réutiliser les variables Cloudinary existantes côté backend. Les images publiques sont enregistrées dans le chemin `cp-art` et limitées à 2400 pixels par côté. Le contenu binaire et le type annoncé sont vérifiés. Ces images servent à présenter les œuvres ; les fichiers haute définition de fabrication doivent être gérés dans un stockage privé distinct lors de l’intégration du prestataire.

MongoDB utilise la connexion habituelle du backend en exploitation. Le serveur de vérification `scripts/art-qa-server.cjs` crée exclusivement une nouvelle base temporaire sur localhost, avec des utilisateurs fictifs ; il ne reçoit aucune URL de base existante.

## Validation

`npm.cmd test` : 46 tests réussis, incluant les politiques CP Art. `scripts/verify-art-api.cjs` : 21 scénarios avec MongoDB temporaire, dont permissions, confidentialité, modification de prix, archivage et répétition des soumissions. Le frontend comporte également des contrôles navigateur du parcours raccordé.

Le compte Cloudinary réel, Stripe, les paiements et les fabrications n’ont pas été sollicités pendant ces vérifications. Aucun déploiement n’est inclus dans cette étape.


## Éditeur et traduction

Les détails symboliques sont facultatifs. Un tableau de détails absent ou vide est accepté et les lignes entièrement vides sont ignorées. Un détail partiellement rempli doit conserver un nom et une explication en français ; la validation évite de supprimer silencieusement du contenu saisi.

L’appel de traduction est protégé par la permission `art:catalog` et limité à 30 requêtes par tranche de 10 minutes dans le limiteur applicatif existant. Il réutilise `OPENAI_API_KEY` et `OPENAI_MODEL`, déjà configurés sur le backend, via Responses et une sortie JSON structurée. La demande ne contient que les textes sélectionnés : titre, accroche, récit, détails et descriptions textuelles des images. Les URL des images, les fichiers d’impression et les références fournisseurs ne sont pas transmis. La réponse n’est pas conservée via `store` côté API OpenAI. Les clés restent sur le serveur.

La traduction ne crée ni ne modifie de fiche. Le frontend remplit les champs cibles vides seulement si le texte français correspondant est resté identique pendant l’appel ; il conserve les traductions manuelles. Une réponse incomplète ou invalide, un délai dépassé ou une erreur fournisseur affiche un échec sans remplacer la saisie. La relecture et la sauvegarde restent explicites.

Vérification : `src/tests/artTranslation.test.ts` couvre les entrées autorisées et les réponses incomplètes. Le serveur de test isolé peut charger un fournisseur simulé avec `CP_ART_QA_TRANSLATION=true`. Les scripts frontend `verify-art-editor.cjs` et `verify-art-translation.cjs` vérifient les contrôles dans le navigateur, la persistance et les modifications concurrentes, sur les seules données temporaires. Les tests du fournisseur sont simulés : ils ne vérifient pas le quota ou la disponibilité du compte OpenAI de production.
