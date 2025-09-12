# Geo-Expert

Geo-Expert est une application web interactive conçue pour l'exploration et l'analyse de données géologiques en France. Elle permet aux utilisateurs de rechercher des localités, d'obtenir des informations géologiques détaillées, et d'interagir avec un assistant IA spécialisé en géologie française.

## Fonctionnalités

*   **Recherche de localités** : Recherche et visualisation de localités en France métropolitaine.
*   **Informations géologiques** : Obtention d'informations détaillées sur la géologie d'un point précis (lithologie, stratigraphie, etc.).
*   **Cartes WMS** : Affichage de couches de données géologiques provenant du BRGM (Bureau de Recherches Géologiques et Minières).
*   **Chatbot Géologique** : Un assistant IA pour répondre à des questions sur la géologie de la région sélectionnée.
*   **Gestion de clés API** : Interface pour configurer les clés API nécessaires pour le service de chat.

## Technologies utilisées

### Frontend

*   **React** : Bibliothèque JavaScript pour la construction d'interfaces utilisateur.
*   **Tailwind CSS** : Framework CSS pour un style rapide et moderne.
*   **shadcn/ui** : Collection de composants d'interface utilisateur réutilisables.
*   **OpenLayers** : Bibliothèque pour l'affichage de cartes interactives.
*   **Axios** : Client HTTP pour les requêtes vers le backend.
*   **Yarn** : Gestionnaire de paquets.

### Backend

*   **Python** : Langage de programmation principal.
*   **FastAPI** : Framework web pour la création d'API haute performance.
*   **Uvicorn** : Serveur ASGI pour FastAPI.
*   **MongoDB** : Base de données NoSQL pour stocker les configurations et les historiques de chat.
*   **Motor** : Driver asynchrone pour MongoDB.
*   **Pydantic** : Bibliothèque pour la validation de données.

## Installation et Lancement

### Prérequis

*   Node.js et Yarn
*   Python 3.8+ et pip
*   Une instance de MongoDB

### Backend

1.  **Accédez au répertoire backend :**
    ```bash
    cd backend
    ```
2.  **Créez et activez un environnement virtuel (recommandé) :**
    ```bash
    # Créez l'environnement
    python -m venv venv

    # Activez-le (sous Windows)
    .\venv\Scripts\activate
    ```
3.  **Installez les dépendances Python :**
    ```bash
    pip install -r requirements.txt
    ```
4.  **Configurez votre base de données :**
    Créez un fichier `.env` à la racine du dossier `backend` et ajoutez l'URL de votre base de données MongoDB :
    ```
    MONGO_URL="mongodb://localhost:27017"
    ```
5.  **Lancez le serveur backend :**
    ```bash
    python -m uvicorn server:app --reload --port 8001
    ```
    Le serveur sera accessible à l'adresse `http://localhost:8001`.

### Frontend

1.  **Accédez au répertoire frontend :**
    ```bash
    cd frontend
    ```
2.  **Installez les dépendances Node.js avec Yarn :**
    ```bash
    yarn install
    ```
3.  **Lancez l'application frontend :**
    ```bash
    yarn start
    ```
    L'application sera accessible à l'adresse `http://localhost:3000` et se connectera automatiquement au backend.

## Déploiement

### GitHub Pages (Frontend uniquement)

L'application peut être déployée sur GitHub Pages pour la partie frontend. Le backend doit être hébergé séparément.

1. **Poussez le code vers GitHub** :
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/your-username/your-repo.git
   git push -u origin main
   ```

2. **Activez GitHub Pages** :
   - Allez dans les paramètres de votre dépôt GitHub
   - Dans "Pages", sélectionnez "GitHub Actions" comme source

3. **Configurez les secrets** (optionnel) :
   - Dans les paramètres du dépôt, ajoutez les secrets suivants :
     - `REACT_APP_BACKEND_URL` : URL de votre backend déployé
     - `REACT_APP_GEMINI_API_KEY` : Votre clé API Gemini (attention à la sécurité)

4. **Le déploiement se fait automatiquement** via GitHub Actions lors des push sur la branche main.

### Backend

Pour déployer le backend, vous pouvez utiliser des services comme :
- Heroku
- Railway
- Render
- VPS (avec Docker)

## Structure du projet

```
.
├── .github/
│   └── workflows/
│       └── deploy.yml    # Workflow GitHub Actions pour le déploiement
├── backend/
│   ├── .env              # Fichier d'environnement pour le backend
│   ├── requirements.txt  # Dépendances Python
│   └── server.py         # Logique du serveur FastAPI
├── frontend/
│   ├── .env              # Variables d'environnement du frontend
│   ├── public/
│   │   └── index.html    # Template HTML principal
│   ├── src/
│   │   ├── components/   # Composants React
│   │   ├── App.js        # Composant principal de l'application
│   │   └── index.js      # Point d'entrée de l'application React
│   ├── package.json      # Dépendances et scripts du frontend
│   └── tailwind.config.js # Configuration de Tailwind CSS
└── README.md             # Ce fichier
```