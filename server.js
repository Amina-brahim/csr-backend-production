const express = require('express');
const app = express();
const cors = require("cors");
const http = require('http').Server(app);
const PORT = process.env.PORT || 4600;
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Chemins des fichiers
const databasesDir = path.resolve(__dirname, 'databases');
const LABO_FILE = path.resolve(databasesDir, 'labo.json');
const CONSULT_FILE = path.resolve(databasesDir, 'consult.json');
const ADMIN_LOG_FILE = path.resolve(databasesDir, 'admin_logs.json');
const EXAMENS_CONFIG_FILE = path.resolve(databasesDir, 'examens_config.json');
const USERS_FILE = path.resolve(databasesDir, 'users.json');

// ====================================================================================
// CONFIGURATION CORS CRITIQUE : Liste blanche pour Vercel + Render
// ====================================================================================

// DÉFINISSEZ ICI L'URL EXACTE DE VOTRE FRONTEND VERCEL
// REMPLACEZ 'https://csr-system.vercel.app' par VOTRE URL VERCEL FINALE
const allowedOrigins = [
    'http://localhost:3000',                     // Développement local
    'https://csr-system.vercel.app',     // VOTRE FRONTEND VERCEL
    // Ajoutez d'autres origines si nécessaire (ex: preview deployments)
    // 'https://*.vercel.app' // Pattern possible, mais moins sécurisé
];

// Middleware CORS pour Express
const corsOptions = {
    origin: function (origin, callback) {
        // Autoriser les requêtes sans origine (comme curl, Postman, serveur à serveur)
        if (!origin) return callback(null, true);
        
        // Vérifier si l'origine est dans la liste blanche
        if (allowedOrigins.some(allowedOrigin => {
            // Gère les patterns avec wildcard
            if (allowedOrigin.includes('*')) {
                const pattern = allowedOrigin.replace('*', '.*');
                return new RegExp(pattern).test(origin);
            }
            return allowedOrigin === origin;
        })) {
            callback(null, true);
        } else {
            console.log('🚫 CORS bloqué pour l\'origine:', origin);
            callback(new Error('Origine non autorisée par CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    credentials: true, // IMPORTANT: pour les cookies/sessions
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Socket-ID']
};

// Appliquez le middleware CORS
app.use(cors(corsOptions));

// Middleware pour parser JSON
app.use(express.json());

// Middleware personnalisé pour CORS headers (sécurité supplémentaire)
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.some(allowed => origin.includes(allowed.replace('*', '')))) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    next();
});

// Route OPTIONS explicite pour les requêtes preflight
app.options('*', cors(corsOptions));

// Middleware pour logger les requêtes
app.use((req, res, next) => {
    console.log(`🌐 ${req.method} ${req.url} - ${new Date().toISOString()}`);
    next();
});

// ====================================================================================
// ROUTES CRITIQUES POUR RENDER.COM
// ====================================================================================

// Route de santé OBLIGATOIRE pour Render
app.get('/health', (req, res) => {
    console.log('🩺 Health check reçu');
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        server: 'CSR Backend',
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

// Route de vérification Socket.IO - CORRIGÉE
app.get('/socket.io/', (req, res) => {
    console.log('📡 Handshake Socket.IO reçu:', req.query);
    
    // Headers CORS explicites
    const origin = req.headers.origin;
    if (origin && allowedOrigins.some(allowed => origin.includes(allowed.replace('*', '')))) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Réponse pour le handshake Socket.IO v4
    res.json({
        success: true,
        message: 'Socket.IO server is running',
        sid: 'render_' + Date.now(),
        upgrades: ['websocket', 'polling'],
        pingInterval: 25000,
        pingTimeout: 20000, // Augmenté pour Render
        maxPayload: 1000000,
        transports: ['polling', 'websocket']
    });
});

// Route pour le polling Socket.IO
app.get('/socket.io/*', (req, res) => {
    console.log('📡 Polling request reçu:', req.path);
    const origin = req.headers.origin;
    if (origin && allowedOrigins.some(allowed => origin.includes(allowed.replace('*', '')))) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.status(200).send('OK');
});

// Route de test de connexion
app.get('/api/test-connection', (req, res) => {
    res.json({
        success: true,
        message: 'Server is running on Render.com',
        timestamp: new Date().toISOString(),
        socketEnabled: true,
        serverInfo: {
            host: 'csr-serveur-backend.onrender.com',
            port: PORT,
            environment: process.env.NODE_ENV,
            nodeVersion: process.version
        }
    });
});

// ====================================================================================
// CONFIGURATION SOCKET.IO POUR RENDER.COM - VERSION CORRIGÉE POUR VERCEL
// ====================================================================================

const socketIO = require('socket.io')(http, {
    cors: {
        origin: function(origin, callback) {
            // Autoriser sans origine ou origine dans la liste blanche
            if (!origin || allowedOrigins.some(allowedOrigin => {
                if (allowedOrigin.includes('*')) {
                    const pattern = allowedOrigin.replace('*', '.*');
                    return new RegExp(pattern).test(origin);
                }
                return allowedOrigin === origin;
            })) {
                callback(null, true);
            } else {
                console.log('🚫 Socket.IO CORS bloqué pour:', origin);
                callback(new Error('Not allowed by CORS'));
            }
        },
        methods: ["GET", "POST"],
        credentials: true,
        allowedHeaders: ["Content-Type", "Authorization"]
    },
    // Configuration critique pour Render
    transports: ['polling', 'websocket'], // polling en premier
    allowUpgrades: true,
    pingTimeout: 60000, // Augmenté pour éviter les déconnexions
    pingInterval: 25000,
    maxHttpBufferSize: 1e8,
    connectTimeout: 30000, // Timeout de connexion augmenté
    // Important pour éviter les problèmes de CORS
    allowEIO3: true,
    cookie: false // Désactiver les cookies pour éviter les problèmes CORS
});

// Variable globale pour Socket.IO
global.io = socketIO;

// Système de verrouillage
const fileLocks = new Map();

const acquireLock = async (filePath) => {
    while (fileLocks.has(filePath)) {
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    fileLocks.set(filePath, true);
    return true;
};

const releaseLock = (filePath) => {
    fileLocks.delete(filePath);
};

// ====================================================================================
// CONFIGURATION INITIALE
// ====================================================================================

let users = [];
let Clients = [];
let FichierLaboOuvert = false;
let dernierNumClient = 0;
let adminLogs = [];

// Configuration par défaut des examens
let examensConfig = {
    consultation: [
        { id: "consult_specialisee", name: "Consultation Spécialisée", prix: 7500 },
        { id: "consult_generale", name: "Consultation Générale", prix: 5000 },
        { id: "consult_professeur", name: "Consultation Reference", prix: 2500 },
        { id: "consult_urgence", name: "Consultation Gynécologie", prix: 10000 }
    ],
    laboratoire: [
        { id: "nfs", name: "NFS", prix: 5000 },
        { id: "ts", name: "TS", prix: 3000 },
        { id: "vs", name: "VS", prix: 2000 },
        { id: "tc", name: "TC", prix: 4000 },
        { id: "tp", name: "TP", prix: 3500 },
        { id: "glycemie", name: "Glycémie", prix: 1500 },
        { id: "uree", name: "Urée", prix: 2000 },
        { id: "creatinine", name: "Créatinine", prix: 2000 },
        { id: "transaminases", name: "Transaminases", prix: 4000 },
        { id: "bilirubine", name: "Bilirubine", prix: 3000 },
        { id: "ionogramme", name: "Ionogramme Sanguin", prix: 4500 },
        { id: "crp", name: "CRP", prix: 3500 }
    ],
    echographie: [
        { id: "echo_gyneco", name: "Echo. Gynéco-Obstétrique", prix: 15000 },
        { id: "echo_abdominale", name: "Echo. Abdominale", prix: 12000 },
        { id: "echo_pelvienne", name: "Echo. Pelvienne", prix: 10000 },
        { id: "echo_prostatique", name: "Echo. Prostatique", prix: 12000 },
        { id: "echo_partie_molle", name: "Echo. de la partie molle", prix: 8000 },
        { id: "echo_renale", name: "Echo. Rénale", prix: 10000 },
        { id: "echo_voies_urinaires", name: "Echo. des voies urinaires", prix: 10000 },
        { id: "echo_thyroidienne", name: "Echo. Thyroidienne", prix: 9000 }
    ],
    hospitalisation: [
        { id: "hosp_jour", name: "Hospitalisation de Jour", prix: 20000 },
        { id: "hosp_nuit", name: "Hospitalisation Nuit", prix: 25000 },
        { id: "hosp_urgence", name: "Hospitalisation Urgence", prix: 30000 },
        { id: "hosp_chambre", name: "Chambre Privée", prix: 15000 },
        { id: "hosp_soins", name: "Soins Infirmiers", prix: 5000 }
    ],
    chirurgie: [
        { id: "chir_mineure", name: "Chirurgie Mineure", prix: 50000 },
        { id: "chir_majeure", name: "Chirurgie Majeure", prix: 150000 },
        { id: "chir_urgence", name: "Chirurgie d'Urgence", prix: 100000 },
        { id: "chir_ambulatoire", name: "Chirurgie Ambulatoire", prix: 40000 }
    ],
    kinesitherapie: [
        { id: "kine_seance", name: "Séance de Kinésithérapie", prix: 8000 },
        { id: "kine_reeducation", name: "Rééducation Fonctionnelle", prix: 10000 },
        { id: "kine_massage", name: "Massage Thérapeutique", prix: 7000 }
    ],
    fibroscopie: [
        { id: "fibro_gastrique", name: "Fibroscopie Gastrique", prix: 25000 },
        { id: "fibro_bronchique", name: "Fibroscopie Bronchique", prix: 30000 },
        { id: "fibro_colique", name: "Fibroscopie Colique", prix: 35000 }
    ]
};

// Stockage des utilisateurs connectés par service
let connectedUsers = new Map();

// ====================================================================================
// FONCTIONS UTILITAIRES
// ====================================================================================

// Fonction pour charger la configuration des examens
const loadExamensConfig = async () => {
    try {
        await fs.access(EXAMENS_CONFIG_FILE);
        const data = await fs.readFile(EXAMENS_CONFIG_FILE, 'utf8');
        if (data.trim()) {
            examensConfig = JSON.parse(data);
            console.log('✅ Configuration des examens chargée');
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            await saveExamensConfig();
            console.log('📁 Fichier de configuration des examens créé');
        } else {
            console.error('❌ Erreur chargement configuration examens:', error);
        }
    }
};

// Fonction pour sauvegarder la configuration des examens
const saveExamensConfig = async () => {
    try {
        await fs.writeFile(EXAMENS_CONFIG_FILE, JSON.stringify(examensConfig, null, 2));
        console.log('✅ Configuration des examens sauvegardée');
    } catch (error) {
        console.error('❌ Erreur sauvegarde configuration examens:', error);
        throw error;
    }
};

// Fonction pour ajouter un nouvel examen
const addNewExam = async (service, examName, examPrice, username = 'system') => {
    try {
        if (!service || !examName || !examPrice) {
            throw new Error('Tous les champs sont obligatoires');
        }

        const price = parseFloat(examPrice);
        if (isNaN(price) || price <= 0) {
            throw new Error('Le prix doit être un nombre positif');
        }

        if (!examensConfig[service]) {
            examensConfig[service] = [];
        }

        const examenExiste = examensConfig[service].some(examen => 
            examen.name.toLowerCase() === examName.toLowerCase().trim()
        );

        if (examenExiste) {
            throw new Error('Cet examen existe déjà dans ce service');
        }

        const examId = examName.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();

        const newExam = {
            id: examId,
            name: examName.trim(),
            prix: price
        };

        examensConfig[service].push(newExam);
        await saveExamensConfig();

        console.log(`✅ Nouvel examen ajouté: ${examName} pour ${service} à ${price} FCFA`);

        await addAdminLog(
            `Nouvel examen ajouté: ${examName} dans ${service} - ${price} FCFA`,
            'exam_added',
            username
        );

        return newExam;

    } catch (error) {
        console.error('❌ Erreur ajout nouvel examen:', error);
        throw error;
    }
};

// Fonction pour modifier un examen existant
const modifyExam = async (service, examId, newName, newPrice, username = 'system') => {
    try {
        if (!service || !examId || !newName || !newPrice) {
            throw new Error('Tous les champs sont obligatoires');
        }

        const price = parseFloat(newPrice);
        if (isNaN(price) || price <= 0) {
            throw new Error('Le prix doit être un nombre positif');
        }

        if (!examensConfig[service]) {
            throw new Error('Service non trouvé');
        }

        const examIndex = examensConfig[service].findIndex(examen => examen.id === examId);
        if (examIndex === -1) {
            throw new Error('Examen non trouvé');
        }

        const nomExisteDeja = examensConfig[service].some((examen, index) => 
            index !== examIndex && examen.name.toLowerCase() === newName.toLowerCase().trim()
        );

        if (nomExisteDeja) {
            throw new Error('Un examen avec ce nom existe déjà dans ce service');
        }

        const ancienExam = { ...examensConfig[service][examIndex] };

        examensConfig[service][examIndex] = {
            ...examensConfig[service][examIndex],
            name: newName.trim(),
            prix: price
        };

        await saveExamensConfig();

        console.log(`✅ Examen modifié: ${ancienExam.name} → ${newName}, ${ancienExam.prix} → ${price} FCFA`);

        await addAdminLog(
            `Examen modifié: ${ancienExam.name} (${ancienExam.prix}F) → ${newName} (${price}F) dans ${service}`,
            'exam_modified',
            username
        );

        return {
            ancienExam: ancienExam,
            nouvelExam: examensConfig[service][examIndex]
        };

    } catch (error) {
        console.error('❌ Erreur modification examen:', error);
        throw error;
    }
};

// Fonction pour supprimer un examen
const deleteExam = async (service, examId, username = 'system') => {
    try {
        if (!service || !examId) {
            throw new Error('Service et examen sont obligatoires');
        }

        if (!examensConfig[service]) {
            throw new Error('Service non trouvé');
        }

        const examIndex = examensConfig[service].findIndex(examen => examen.id === examId);
        if (examIndex === -1) {
            throw new Error('Examen non trouvé');
        }

        const examASupprimer = examensConfig[service][examIndex];

        examensConfig[service].splice(examIndex, 1);
        await saveExamensConfig();

        console.log(`✅ Examen supprimé: ${examASupprimer.name} du service ${service}`);

        await addAdminLog(
            `Examen supprimé: ${examASupprimer.name} (${examASupprimer.prix}F) du service ${service}`,
            'exam_deleted',
            username
        );

        return examASupprimer;

    } catch (error) {
        console.error('❌ Erreur suppression examen:', error);
        throw error;
    }
};

// Fonction pour obtenir les services disponibles
const getAvailableServices = () => {
    return [
        { value: 'consultation', name: 'Consultation' },
        { value: 'laboratoire', name: 'Laboratoire' },
        { value: 'echographie', name: 'Echographie' },
        { value: 'hospitalisation', name: 'Hospitalisation' },
        { value: 'chirurgie', name: 'Chirurgie' },
        { value: 'kinesitherapie', name: 'Kinésithérapie' },
        { value: 'fibroscopie', name: 'Fibroscopie' }
    ];
};

// ====================================================================================
// GESTION DES UTILISATEURS - CORRIGÉE
// ====================================================================================

let usersDatabase = [
    {
        id: 1,
        username: "admin",
        password: "admin123",
        service: "Administration",
        fullName: "Administrateur Principal",
        email: "",
        isActive: true,
        createdAt: new Date().toISOString(),
        lastLogin: null,
        permissions: ["all"]
    },
    {
        id: 2,
        username: "Chouaib",
        password: "SansPasse",
        service: "Administration",
        fullName: "Chouaib",
        email: "",
        isActive: true,
        createdAt: new Date().toISOString(),
        lastLogin: null,
        permissions: ["all"]
    },
    {
        id: 3,
        username: "Djibrine",
        password: "SansPasse",
        service: "Administration",
        fullName: "Djibrine",
        email: "",
        isActive: true,
        createdAt: new Date().toISOString(),
        lastLogin: null,
        permissions: ["all"]
    },
    {
        id: 4,
        username: "Labo",
        password: "12345678",
        service: "Laboratoire",
        fullName: "Technicien Laboratoire",
        email: "",
        isActive: true,
        createdAt: new Date().toISOString(),
        lastLogin: null,
        permissions: ["labo", "view", "update_status"]
    },
    {
        id: 5,
        username: "Caisse",
        password: "12345678",
        service: "Caisse",
        fullName: "Caissier Principal",
        email: "",
        isActive: true,
        createdAt: new Date().toISOString(),
        lastLogin: null,
        permissions: ["caisse", "view", "create_patient"]
    },
    {
        id: 6,
        username: "Consultation",
        password: "12345678",
        service: "Consultation",
        fullName: "Médecin Consultant",
        email: "",
        isActive: true,
        createdAt: new Date().toISOString(),
        lastLogin: null,
        permissions: ["consultation", "view"]
    }
];

const availableServices = [
    "Administration",
    "Laboratoire", 
    "Caisse",
    "Consultation",
    "Radiologie",
    "Pharmacie",
    "Hospitalisation",
    "Maintenance"
];

// Charger les utilisateurs depuis le fichier
const loadUsers = async () => {
    try {
        await fs.access(USERS_FILE);
        const data = await fs.readFile(USERS_FILE, 'utf8');
        if (data.trim()) {
            usersDatabase = JSON.parse(data);
            console.log('✅ Utilisateurs chargés: ' + usersDatabase.length);
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            await saveUsers();
            console.log('📁 Fichier utilisateurs créé avec la configuration par défaut');
        } else {
            console.error('❌ Erreur chargement utilisateurs:', error);
        }
    }
};

// Sauvegarder les utilisateurs
const saveUsers = async () => {
    try {
        await fs.writeFile(USERS_FILE, JSON.stringify(usersDatabase, null, 2));
        console.log('✅ Utilisateurs sauvegardés');
    } catch (error) {
        console.error('❌ Erreur sauvegarde utilisateurs:', error);
        throw error;
    }
};

// Générer un ID unique
const generateUserId = () => {
    return Date.now() + Math.floor(Math.random() * 1000);
};

// Mettre à jour la dernière connexion
const updateUserLastLogin = async (username) => {
    try {
        const userIndex = usersDatabase.findIndex(user => user.username === username);
        if (userIndex !== -1) {
            usersDatabase[userIndex].lastLogin = new Date().toISOString();
            await saveUsers();
            console.log(`✅ Dernière connexion mise à jour pour: ${username}`);
            return usersDatabase[userIndex];
        }
        return null;
    } catch (error) {
        console.error('❌ Erreur mise à jour dernière connexion:', error);
        return null;
    }
};

// Ajouter un utilisateur
const addUser = async (userData, username = 'system') => {
    try {
        console.log('🔄 Tentative d\'ajout utilisateur:', userData);
        
        if (!userData.username || !userData.password || !userData.service || !userData.fullName) {
            throw new Error('Tous les champs obligatoires doivent être remplis');
        }

        const userExists = usersDatabase.some(user => 
            user.username.toLowerCase() === userData.username.toLowerCase()
        );

        if (userExists) {
            throw new Error('Un utilisateur avec ce nom existe déjà');
        }

        if (!availableServices.includes(userData.service)) {
            throw new Error('Service invalide');
        }

        const newUser = {
            id: generateUserId(),
            username: userData.username.trim(),
            password: userData.password,
            service: userData.service,
            fullName: userData.fullName.trim(),
            email: userData.email || '',
            isActive: userData.isActive !== undefined ? userData.isActive : true,
            createdAt: new Date().toISOString(),
            lastLogin: null,
            permissions: userData.permissions || getDefaultPermissions(userData.service)
        };

        usersDatabase.push(newUser);
        await saveUsers();

        console.log(`✅ Nouvel utilisateur ajouté: ${newUser.username} (${newUser.service})`);

        await addAdminLog(
            `Nouvel utilisateur créé: ${newUser.username} - ${newUser.fullName} (${newUser.service})`,
            'user_created',
            username
        );

        return newUser;

    } catch (error) {
        console.error('❌ Erreur ajout utilisateur:', error);
        throw error;
    }
};

// Modifier un utilisateur
const modifyUser = async (userId, userData, username = 'system') => {
    try {
        console.log('🔄 Tentative de modification utilisateur:', userId, userData);
        
        if (!userId) {
            throw new Error('ID utilisateur manquant');
        }

        const userIndex = usersDatabase.findIndex(user => user.id === userId);
        if (userIndex === -1) {
            throw new Error('Utilisateur non trouvé');
        }

        const oldUser = { ...usersDatabase[userIndex] };

        if (userData.username !== undefined) {
            const usernameExists = usersDatabase.some((user, index) => 
                index !== userIndex && user.username.toLowerCase() === userData.username.toLowerCase()
            );
            if (usernameExists) {
                throw new Error('Un autre utilisateur avec ce nom existe déjà');
            }
            usersDatabase[userIndex].username = userData.username.trim();
        }

        if (userData.password !== undefined && userData.password !== '') {
            usersDatabase[userIndex].password = userData.password;
        }

        if (userData.service !== undefined) {
            if (!availableServices.includes(userData.service)) {
                throw new Error('Service invalide');
            }
            usersDatabase[userIndex].service = userData.service;
            usersDatabase[userIndex].permissions = getDefaultPermissions(userData.service);
        }

        if (userData.fullName !== undefined) {
            usersDatabase[userIndex].fullName = userData.fullName.trim();
        }

        if (userData.email !== undefined) {
            usersDatabase[userIndex].email = userData.email;
        }

        if (userData.isActive !== undefined) {
            usersDatabase[userIndex].isActive = userData.isActive;
        }

        if (userData.permissions !== undefined) {
            usersDatabase[userIndex].permissions = userData.permissions;
        }

        await saveUsers();

        console.log(`✅ Utilisateur modifié: ${usersDatabase[userIndex].username}`);

        await addAdminLog(
            `Utilisateur modifié: ${oldUser.username} → ${usersDatabase[userIndex].username}`,
            'user_modified',
            username
        );

        return {
            oldUser: oldUser,
            updatedUser: usersDatabase[userIndex]
        };

    } catch (error) {
        console.error('❌ Erreur modification utilisateur:', error);
        throw error;
    }
};

// Supprimer un utilisateur
const deleteUser = async (userId, username = 'system') => {
    try {
        console.log('🔄 Tentative de suppression utilisateur:', userId);
        
        if (!userId) {
            throw new Error('ID utilisateur manquant');
        }

        const userIndex = usersDatabase.findIndex(user => user.id === userId);
        if (userIndex === -1) {
            throw new Error('Utilisateur non trouvé');
        }

        const userToDelete = usersDatabase[userIndex];

        if (userToDelete.username === 'admin') {
            throw new Error('Impossible de supprimer le compte administrateur principal');
        }

        usersDatabase.splice(userIndex, 1);
        await saveUsers();

        console.log(`✅ Utilisateur supprimé: ${userToDelete.username}`);

        await addAdminLog(
            `Utilisateur supprimé: ${userToDelete.username} - ${userToDelete.fullName}`,
            'user_deleted',
            username
        );

        return userToDelete;

    } catch (error) {
        console.error('❌ Erreur suppression utilisateur:', error);
        throw error;
    }
};

// Obtenir les permissions par défaut
const getDefaultPermissions = (service) => {
    const permissionsMap = {
        'Administration': ['all'],
        'Laboratoire': ['labo', 'view', 'update_status'],
        'Caisse': ['caisse', 'view', 'create_patient'],
        'Consultation': ['consultation', 'view'],
        'Radiologie': ['radiologie', 'view'],
        'Pharmacie': ['pharmacie', 'view'],
        'Hospitalisation': ['hospitalisation', 'view'],
        'Maintenance': ['maintenance', 'view']
    };
    
    return permissionsMap[service] || ['view'];
};

// FONCTION VERIFY CREDENTIALS CRITIQUE - VERSION CORRIGÉE
const verifyCredentials = (username, password) => {
    console.log('🔐 [SERVER] Vérification credentials pour:', username);
    
    // Recherche insensible à la casse
    const user = usersDatabase.find(u => 
        u.username.toLowerCase() === username.toLowerCase() && 
        u.password === password &&
        u.isActive === true
    );
    
    if (user) {
        console.log('✅ [SERVER] Utilisateur authentifié:', user.username, 'Service:', user.service);
        return {
            id: user.id,
            username: user.username,
            service: user.service,
            fullName: user.fullName || user.username,
            permissions: user.permissions || [],
            lastLogin: user.lastLogin
        };
    } else {
        console.log('❌ [SERVER] Échec authentification pour:', username);
        return null;
    }
};

// ====================================================================================
// FONCTIONS POUR L'ANNULATION DE PAIEMENT
// ====================================================================================

// Trouver un patient par ID CSR
const trouverPatientParCSR = async (patientId) => {
    try {
        const patients = await loadPatientData();
        return patients.find(p => p.numID_CSR === patientId) || null;
    } catch (error) {
        console.error('Erreur dans trouverPatientParCSR:', error);
        return null;
    }
};

// Générer un ID unique
const generateId = () => {
    return Date.now() + '_' + Math.random().toString(36).substr(2, 9);
};

// Sauvegarder l'annulation
const sauvegarderAnnulation = async (annulation) => {
    const annulationsFile = path.resolve(databasesDir, 'payment_cancellations.json');
    
    try {
        await ensureDirectoryExists(databasesDir);
        
        let annulationsExistantes = [];
        try {
            const data = await fs.readFile(annulationsFile, 'utf8');
            if (data.trim()) {
                annulationsExistantes = JSON.parse(data);
            }
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }

        annulationsExistantes.unshift(annulation);
        
        if (annulationsExistantes.length > 1000) {
            annulationsExistantes = annulationsExistantes.slice(0, 1000);
        }
        
        await fs.writeFile(annulationsFile, JSON.stringify(annulationsExistantes, null, 2));
        
        console.log(`✅ Annulation sauvegardée: ${annulation.patientName} - ${annulation.amount} FCFA`);
        return true;
    } catch (error) {
        console.error('❌ Erreur sauvegarde annulation:', error);
        throw error;
    }
};

// Supprimer un patient
const supprimerPatient = async (patientId) => {
    let lockAcquired = false;
    try {
        await acquireLock(LABO_FILE);
        lockAcquired = true;
        
        const data = await fs.readFile(LABO_FILE, 'utf8');
        let patients = JSON.parse(data);

        const patientIndex = patients.findIndex(p => p.numID_CSR === patientId);
        
        if (patientIndex === -1) {
            throw new Error(`Patient ${patientId} non trouvé`);
        }

        const patientSupprime = patients[patientIndex];
        
        patients.splice(patientIndex, 1);
        
        const tmpFile = LABO_FILE + '.tmp';
        await fs.writeFile(tmpFile, JSON.stringify(patients, null, 2));
        await fs.rename(tmpFile, LABO_FILE);

        console.log(`✅ Patient supprimé: ${patientSupprime.nomClient} (${patientId})`);
        return patientSupprime;
    } catch (error) {
        console.error('❌ Erreur suppression patient:', error);
        throw error;
    } finally {
        if (lockAcquired) {
            releaseLock(LABO_FILE);
        }
    }
};

// Charger l'historique des annulations
const loadCancellationHistory = async () => {
    const annulationsFile = path.resolve(databasesDir, 'payment_cancellations.json');
    
    try {
        await fs.access(annulationsFile);
        const data = await fs.readFile(annulationsFile, 'utf8');
        if (!data.trim()) return [];
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.writeFile(annulationsFile, '[]');
            return [];
        }
        throw error;
    }
};

// Créer le répertoire si il n'existe pas
async function ensureDirectoryExists(dirPath) {
    try {
        await fs.access(dirPath);
        console.log('Répertoire existe: ' + dirPath);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.mkdir(dirPath, { recursive: true });
            console.log('Répertoire créé: ' + dirPath);
        } else {
            throw error;
        }
    }
}

// Obtenir l'adresse IP locale
function getLocalIP() {
    try {
        const interfaces = os.networkInterfaces();
        for (const interfaceName in interfaces) {
            for (const iface of interfaces[interfaceName]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    return iface.address;
                }
            }
        }
        return '0.0.0.0';
    } catch (error) {
        console.error('Erreur lors de la détection de l\'IP:', error);
        return '0.0.0.0';
    }
}

// Charger le dernier numéro de client
async function chargerDernierNumClient() {
    try {
        const data = await fs.readFile(LABO_FILE, 'utf8');
        if (data.trim()) {
            const patients = JSON.parse(data);
            if (patients.length > 0) {
                const maxNumClient = Math.max(...patients.map(p => {
                    const num = parseInt(p.numClient);
                    return isNaN(num) ? 0 : num;
                }));
                dernierNumClient = maxNumClient;
                console.log('Dernier numéro client chargé: ' + dernierNumClient);
            } else {
                dernierNumClient = 0;
                console.log('Aucun patient trouvé, numéro client initialisé à 0');
            }
        } else {
            dernierNumClient = 0;
            console.log('Fichier vide, numéro client initialisé à 0');
        }
    } catch (error) {
        console.error('Erreur lors du chargement du dernier numéro client:', error);
        dernierNumClient = 0;
    }
}

// Initialiser le fichier labo
async function initializeLaboFile() {
    try {
        await ensureDirectoryExists(databasesDir);
        
        try {
            await fs.access(LABO_FILE);
            console.log('Fichier labo.json existe déjà');
            await chargerDernierNumClient();
        } catch (error) {
            if (error.code === 'ENOENT') {
                await fs.writeFile(LABO_FILE, '[]');
                console.log('Fichier labo.json créé');
                dernierNumClient = 0;
            } else {
                throw error;
            }
        }
    } catch (error) {
        console.error('Erreur lors de l\'initialisation:', error);
    }
}

// Charger les données des patients
const loadPatientData = async () => {
    try {
        const data = await fs.readFile(LABO_FILE, 'utf8');
        if (!data.trim()) return [];
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.writeFile(LABO_FILE, '[]');
            return [];
        }
        throw error;
    }
};

// Mettre à jour le statut par numClient
const updateLaboratorizedStatus = async (numClient, newStatus) => {
    let lockAcquired = false;
    try {
        await acquireLock(LABO_FILE);
        lockAcquired = true;
        
        const data = await fs.readFile(LABO_FILE, 'utf8');
        let records = JSON.parse(data);

        const recordIndex = records.findIndex(r => r.numClient == numClient);

        if (recordIndex === -1) {
            throw new Error('Client ' + numClient + ' non trouvé');
        }

        records[recordIndex] = {
            ...records[recordIndex],
            isLaboratorized: newStatus,
            updatedAt: new Date().toISOString()
        };

        const tmpFile = LABO_FILE + '.tmp';
        await fs.writeFile(tmpFile, JSON.stringify(records, null, 2));
        await fs.rename(tmpFile, LABO_FILE);

        return records[recordIndex];
    } catch (error) {
        console.error('Erreur lors de la mise à jour:', error);
        throw error;
    } finally {
        if (lockAcquired) {
            releaseLock(LABO_FILE);
        }
    }
};

// Mettre à jour le statut par numID_CSR
const updateLaboratorizedStatusByCSR = async (numID_CSR, newStatus) => {
    let lockAcquired = false;
    try {
        await acquireLock(LABO_FILE);
        lockAcquired = true;
        
        const data = await fs.readFile(LABO_FILE, 'utf8');
        let records = JSON.parse(data);

        const recordIndex = records.findIndex(r => r.numID_CSR === numID_CSR);

        if (recordIndex === -1) {
            throw new Error('Client ' + numID_CSR + ' non trouvé');
        }

        records[recordIndex] = {
            ...records[recordIndex],
            isLaboratorized: newStatus,
            updatedAt: new Date().toISOString()
        };

        const tmpFile = LABO_FILE + '.tmp';
        await fs.writeFile(tmpFile, JSON.stringify(records, null, 2));
        await fs.rename(tmpFile, LABO_FILE);

        return records[recordIndex];
    } catch (error) {
        console.error('Erreur lors de la mise à jour par CSR:', error);
        throw error;
    } finally {
        if (lockAcquired) {
            releaseLock(LABO_FILE);
        }
    }
};

// Générer un nouvel ID client
const generateNewClientId = async () => {
    try {
        dernierNumClient++;
        console.log('Nouveau numéro client généré: ' + dernierNumClient);
        return dernierNumClient;
    } catch (error) {
        console.error('Erreur génération ID:', error);
        dernierNumClient++;
        return dernierNumClient;
    }
};

// Ajouter un log d'administration
const addAdminLog = async (message, type = 'info', user = 'system') => {
    const logEntry = {
        id: Date.now() + Math.random(),
        timestamp: new Date().toISOString(),
        type: type,
        user: user,
        message: message,
        socketId: null
    };
    
    adminLogs.unshift(logEntry);
    if (adminLogs.length > 500) {
        adminLogs = adminLogs.slice(0, 500);
    }
    
    try {
        await ensureDirectoryExists(databasesDir);
        const logsToSave = adminLogs.slice(0, 1000);
        await fs.writeFile(ADMIN_LOG_FILE, JSON.stringify(logsToSave, null, 2));
    } catch (error) {
        console.error('Erreur sauvegarde logs admin:', error);
    }
    
    socketIO.emit('admin_log', logEntry);
    return logEntry;
};

// Charger les logs d'administration
const loadAdminLogs = async () => {
    try {
        await fs.access(ADMIN_LOG_FILE);
        const data = await fs.readFile(ADMIN_LOG_FILE, 'utf8');
        if (data.trim()) {
            const logs = JSON.parse(data);
            adminLogs = logs.slice(0, 500);
            console.log('Chargement de ' + logs.length + ' logs d\'administration');
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.writeFile(ADMIN_LOG_FILE, '[]');
        }
    }
};

// Obtenir les statistiques du serveur
const getServerStats = () => {
    return {
        totalPatients: dernierNumClient,
        activeConnections: socketIO.engine.clientsCount,
        serverUptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        timestamp: new Date().toISOString()
    };
};

// Déterminer le service
const determineService = (socket, data = {}) => {
    if (data.service) {
        return data.service;
    }
    
    if (socket.handshake.headers.referer) {
        const referer = socket.handshake.headers.referer;
        if (referer.includes('/MGLabo')) return 'Laboratoire';
        if (referer.includes('/MGCaisse')) return 'Caisse';
        if (referer.includes('/MGSpecialities')) return 'Consultation';
        if (referer.includes('/Administration')) return 'Administration';
        if (referer.includes('/MgJournaux')) return 'Journaux';
    }
    
    const existingUser = connectedUsers.get(socket.id);
    if (existingUser && existingUser.service) {
        return existingUser.service;
    }
    
    return 'Autre';
};

// Obtenir la liste des utilisateurs connectés par service
const getConnectedUsersByService = () => {
    const usersByService = {
        'Laboratoire': [],
        'Caisse': [],
        'Consultation': [],
        'Administration': [],
        'Radiologie': [],
        'Pharmacie': [],
        'Hospitalisation': [],
        'Maintenance': [],
        'Autre': []
    };
    
    connectedUsers.forEach((userData, socketId) => {
        const service = userData.service || 'Autre';
        if (usersByService[service]) {
            usersByService[service].push({
                socketId: socketId,
                username: userData.username,
                fullName: userData.fullName || userData.username,
                service: service,
                connectTime: userData.connectTime,
                isIdentified: userData.isIdentified || false,
                lastLogin: userData.lastLogin || new Date().toISOString()
            });
        } else {
            usersByService['Autre'].push({
                socketId: socketId,
                username: userData.username,
                fullName: userData.fullName || userData.username,
                service: service,
                connectTime: userData.connectTime,
                isIdentified: userData.isIdentified || false,
                lastLogin: userData.lastLogin || new Date().toISOString()
            });
        }
    });
    
    return usersByService;
};

// ====================================================================================
// SOCKET.IO HANDLERS - VERSION CORRIGÉE POUR RENDER ET VERCEL
// ====================================================================================

socketIO.on('connection', (socket) => {
    console.log('✅✅✅ NOUVELLE CONNEXION Socket.io: ' + socket.id);
    console.log('📡 IP: ' + socket.handshake.address);
    console.log('🌐 Headers:', socket.handshake.headers);
    
    // Vérifier l'origine de la connexion
    const origin = socket.handshake.headers.origin || socket.handshake.headers.referer;
    if (origin && !allowedOrigins.some(allowed => origin.includes(allowed.replace('*', '')))) {
        console.log('🚫 Connexion Socket.IO rejetée - Origine non autorisée:', origin);
        socket.disconnect(true);
        return;
    }
    
    // Envoyer immédiatement les infos de connexion
    socket.emit('server_info', {
        serverIP: 'csr-serveur-backend.onrender.com',
        serverPort: PORT,
        connectionType: 'socket.io',
        transports: ['polling', 'websocket'],
        connected: true,
        socketId: socket.id,
        timestamp: new Date().toISOString()
    });

    const userService = determineService(socket);
    const userData = {
        service: userService,
        username: 'En attente d\'identification...',
        fullName: 'Utilisateur non identifié',
        connectTime: new Date().toISOString(),
        ip: socket.handshake.address,
        isIdentified: false
    };
    
    connectedUsers.set(socket.id, userData);
    
    addAdminLog('Nouvelle connexion détectée: ' + socket.id, 'connection', 'system');

    // Notifier de la nouvelle connexion
    socketIO.emit('user_connected', {
        socketId: socket.id,
        service: userService,
        username: userData.username,
        fullName: userData.fullName,
        connectTime: userData.connectTime,
        connectedUsers: getConnectedUsersByService()
    });

    // Initialisation
    initializeLaboFile().catch(console.error);

    // ============================================================================
    // GESTIONNAIRE USER_IDENTIFICATION - CORRIGÉ
    // ============================================================================

    socket.on('user_identification', async (userInfo) => {
        try {
            console.log('🔐 Identification utilisateur reçue:', userInfo);
            
            if (!userInfo || !userInfo.username || !userInfo.service) {
                console.log('❌ Données d\'identification incomplètes');
                socket.emit('identification_failed', { 
                    message: 'Données d\'identification incomplètes' 
                });
                return;
            }

            // Vérifier si l'utilisateur existe dans la base
            const user = usersDatabase.find(u => 
                u.username.toLowerCase() === userInfo.username.toLowerCase() && 
                u.service === userInfo.service &&
                u.isActive === true
            );

            if (!user) {
                console.log('❌ Utilisateur non trouvé ou inactif:', userInfo.username);
                socket.emit('identification_failed', { 
                    message: 'Utilisateur non trouvé ou compte inactif' 
                });
                return;
            }

            // Mettre à jour la dernière connexion
            await updateUserLastLogin(userInfo.username);

            const updatedUserData = {
                service: user.service,
                username: user.username,
                fullName: user.fullName || user.username,
                connectTime: new Date().toISOString(),
                lastLogin: new Date().toISOString(),
                isIdentified: true,
                userId: user.id,
                permissions: user.permissions || []
            };
            
            connectedUsers.set(socket.id, updatedUserData);
            
            console.log(`✅ Utilisateur identifié: ${user.username} (${user.service})`);

            // Envoyer la confirmation
            socket.emit('identification_confirmed', {
                success: true,
                user: updatedUserData,
                message: `Identifié avec succès comme ${user.username} (${user.service})`
            });

            // Notifier tous les clients
            socketIO.emit('user_connected', {
                socketId: socket.id,
                service: updatedUserData.service,
                username: updatedUserData.username,
                fullName: updatedUserData.fullName,
                connectTime: updatedUserData.connectTime,
                connectedUsers: getConnectedUsersByService()
            });

            await addAdminLog(
                `Utilisateur connecté: ${user.username} (${user.service})`,
                'user_connection',
                user.username
            );
            
        } catch (error) {
            console.error('❌ Erreur identification:', error);
            socket.emit('identification_failed', { 
                message: 'Erreur lors de l\'identification: ' + error.message 
            });
        }
    });

    // ============================================================================
    // GESTIONNAIRE VERIFY_USER_CREDENTIALS - CRITIQUE
    // ============================================================================

    socket.on('verify_user_credentials', async (credentials, callback) => {
        try {
            console.log('🔐 [SERVER] Vérification credentials reçue:', credentials);
            
            if (!credentials || !credentials.username || !credentials.password) {
                console.log('❌ [SERVER] Credentials incomplets');
                if (callback) {
                    callback({
                        success: false,
                        isValid: false,
                        message: 'Nom d\'utilisateur et mot de passe requis'
                    });
                }
                return;
            }

            const user = verifyCredentials(credentials.username, credentials.password);
            
            if (user) {
                console.log('✅ [SERVER] Utilisateur authentifié:', user.username);
                
                // Mettre à jour la dernière connexion
                await updateUserLastLogin(credentials.username);
                
                if (callback) {
                    callback({
                        success: true,
                        isValid: true,
                        user: user,
                        message: 'Authentification réussie'
                    });
                }
            } else {
                console.log('❌ [SERVER] Échec authentification pour:', credentials.username);
                if (callback) {
                    callback({
                        success: true,
                        isValid: false,
                        user: null,
                        message: 'Nom d\'utilisateur ou mot de passe incorrect'
                    });
                }
            }
            
        } catch (error) {
            console.error('❌ [SERVER] Erreur vérification credentials:', error);
            if (callback) {
                callback({
                    success: false,
                    message: 'Erreur interne du serveur: ' + error.message
                });
            }
        }
    });

    // ============================================================================
    // GESTIONNAIRES EXISTANTS (conservés)
    // ============================================================================

    socket.on('get_users_list', async (callback) => {
        try {
            console.log('📋 [SERVER] Demande de liste des utilisateurs');
            
            if (callback) {
                callback({
                    success: true,
                    users: usersDatabase,
                    services: availableServices,
                    count: usersDatabase.length
                });
            }
        } catch (error) {
            console.error('❌ Erreur récupération liste utilisateurs:', error);
            if (callback) {
                callback({
                    success: false,
                    message: error.message
                });
            }
        }
    });

    socket.on('add_new_user', async (userData, callback) => {
        console.log('👤 [SERVER] Demande d\'ajout nouvel utilisateur:', userData);
        
        try {
            const newUser = await addUser(userData, userData.adminUsername);
            
            if (callback) {
                callback({
                    success: true,
                    message: `✅ Utilisateur "${newUser.username}" créé avec succès`,
                    newUser: newUser
                });
            }
            
        } catch (error) {
            console.error('❌ [SERVER] Erreur ajout utilisateur:', error);
            
            if (callback) {
                callback({
                    success: false,
                    message: '❌ Erreur lors de la création: ' + error.message
                });
            }
        }
    });

    socket.on('modify_user', async (userData, callback) => {
        console.log('👤 [SERVER] Demande de modification utilisateur:', userData);
        
        try {
            const result = await modifyUser(userData.userId, userData, userData.adminUsername);
            
            if (callback) {
                callback({
                    success: true,
                    message: `✅ Utilisateur "${result.updatedUser.username}" modifié avec succès`,
                    oldUser: result.oldUser,
                    updatedUser: result.updatedUser
                });
            }
            
        } catch (error) {
            console.error('❌ [SERVER] Erreur modification utilisateur:', error);
            
            if (callback) {
                callback({
                    success: false,
                    message: '❌ Erreur lors de la modification: ' + error.message
                });
            }
        }
    });

    socket.on('delete_user', async (userData, callback) => {
        console.log('👤 [SERVER] Demande de suppression utilisateur:', userData);
        
        try {
            const deletedUser = await deleteUser(userData.userId, userData.adminUsername);
            
            if (callback) {
                callback({
                    success: true,
                    message: `✅ Utilisateur "${deletedUser.username}" supprimé avec succès`,
                    deletedUser: deletedUser
                });
            }
            
        } catch (error) {
            console.error('❌ [SERVER] Erreur suppression utilisateur:', error);
            
            if (callback) {
                callback({
                    success: false,
                    message: '❌ Erreur lors de la suppression: ' + error.message
                });
            }
        }
    });

    socket.on('get_examens_config', async (callback) => {
        try {
            if (callback) {
                callback({
                    success: true,
                    examensConfig: examensConfig,
                    services: getAvailableServices()
                });
            }
        } catch (error) {
            console.error('❌ Erreur récupération configuration examens:', error);
            if (callback) {
                callback({
                    success: false,
                    message: error.message
                });
            }
        }
    });

    socket.on('add_new_exam', async (examData, callback) => {
        console.log('🔧 [SERVER] Demande d\'ajout nouvel examen:', examData);
        
        try {
            const { service, examName, examPrice, username } = examData;
            
            const newExam = await addNewExam(service, examName, examPrice, username);
            
            socketIO.emit('examens_config_updated', examensConfig);
            
            console.log('🔧 [SERVER] Configuration diffusée à tous les clients');
            
            if (callback) {
                callback({
                    success: true,
                    message: `✅ Examen "${examName}" ajouté avec succès au service ${service} pour ${examPrice} FCFA`,
                    newExam: newExam
                });
            }
            
        } catch (error) {
            console.error('❌ [SERVER] Erreur ajout nouvel examen:', error);
            
            if (callback) {
                callback({
                    success: false,
                    message: '❌ Erreur lors de l\'ajout: ' + error.message
                });
            }
            
            await addAdminLog(
                'Erreur ajout examen: ' + error.message,
                'error',
                examData.username || 'admin'
            );
        }
    });

    socket.on('modify_exam', async (examData, callback) => {
        console.log('🔧 [SERVER] Demande de modification d\'examen:', examData);
        
        try {
            const { service, examId, newName, newPrice, username } = examData;
            
            const result = await modifyExam(service, examId, newName, newPrice, username);
            
            socketIO.emit('examens_config_updated', examensConfig);
            
            console.log('🔧 [SERVER] Configuration modifiée diffusée à tous les clients');
            
            if (callback) {
                callback({
                    success: true,
                    message: `✅ Examen "${result.ancienExam.name}" modifié avec succès`,
                    ancienExam: result.ancienExam,
                    nouvelExam: result.nouvelExam
                });
            }
            
        } catch (error) {
            console.error('❌ [SERVER] Erreur modification examen:', error);
            
            if (callback) {
                callback({
                    success: false,
                    message: '❌ Erreur lors de la modification: ' + error.message
                });
            }
            
            await addAdminLog(
                'Erreur modification examen: ' + error.message,
                'error',
                examData.username || 'admin'
            );
        }
    });

    socket.on('delete_exam', async (examData, callback) => {
        console.log('🔧 [SERVER] Demande de suppression d\'examen:', examData);
        
        try {
            const { service, examId, username } = examData;
            
            const examSupprime = await deleteExam(service, examId, username);
            
            socketIO.emit('examens_config_updated', examensConfig);
            
            console.log('🔧 [SERVER] Configuration mise à jour diffusée à tous les clients après suppression');
            
            if (callback) {
                callback({
                    success: true,
                    message: `✅ Examen "${examSupprime.name}" supprimé avec succès`,
                    examSupprime: examSupprime
                });
            }
            
        } catch (error) {
            console.error('❌ [SERVER] Erreur suppression examen:', error);
            
            if (callback) {
                callback({
                    success: false,
                    message: '❌ Erreur lors de la suppression: ' + error.message
                });
            }
            
            await addAdminLog(
                'Erreur suppression examen: ' + error.message,
                'error',
                examData.username || 'admin'
            );
        }
    });

    // Gestionnaire pour l'annulation de paiement
    socket.on('cancel_patient_payment', async (data, callback) => {
        try {
            console.log('🔔 [SERVER] Annulation de paiement demandée:', data);
            
            const patient = await trouverPatientParCSR(data.patientId);
            if (!patient) {
                console.log('❌ [SERVER] Patient non trouvé:', data.patientId);
                if (callback) {
                    callback({ 
                        success: false, 
                        message: 'Patient non trouvé' 
                    });
                }
                return;
            }

            console.log(`✅ [SERVER] Patient trouvé: ${patient.nomClient} - ${data.amount} FCFA`);

            const annulation = {
                id: generateId(),
                patientId: data.patientId,
                patientName: data.patientName,
                amount: data.amount,
                services: data.services,
                reason: data.reason,
                cancelledBy: data.cancelledBy,
                timestamp: data.timestamp,
                status: 'annulé',
                originalPatientData: {
                    nomClient: patient.nomClient,
                    numClient: patient.numClient,
                    numAirTel: patient.numAirTel,
                    numTIGO: patient.numTIGO,
                    dateCreation: patient.dateCreation
                }
            };
            
            await sauvegarderAnnulation(annulation);
            
            const patientSupprime = await supprimerPatient(data.patientId);
            
            socketIO.emit('payment_cancelled', {
                patientId: data.patientId,
                patientName: data.patientName,
                amount: data.amount,
                cancelledBy: data.cancelledBy,
                timestamp: data.timestamp,
                reason: data.reason
            });

            socketIO.emit('patient_deleted', {
                patientId: data.patientId,
                deletedBy: data.cancelledBy,
                timestamp: data.timestamp
            });

            await addAdminLog(
                `Paiement annulé: ${data.patientName} (${data.patientId}) - ${data.amount} FCFA - Motif: ${data.reason}`,
                'payment_cancelled',
                data.cancelledBy
            );

            console.log(`✅ [SERVER] Paiement annulé avec succès pour ${data.patientName}`);

            if (callback) {
                callback({ 
                    success: true, 
                    message: `Paiement de ${data.amount} FCFA annulé pour ${data.patientName}`,
                    annulation: annulation
                });
            }
            
        } catch (error) {
            console.error('❌ [SERVER] Erreur lors de l\'annulation:', error);
            
            await addAdminLog(
                `Erreur annulation paiement: ${error.message}`,
                'error',
                data.cancelledBy || 'system'
            );

            if (callback) {
                callback({ 
                    success: false, 
                    message: 'Erreur interne du serveur: ' + error.message 
                });
            }
        }
    });

    // Gestionnaire pour récupérer l'historique des annulations
    socket.on('get_cancellation_history', async (callback) => {
        try {
            const history = await loadCancellationHistory();
            
            if (callback) {
                callback({
                    success: true,
                    history: history,
                    count: history.length,
                    message: `${history.length} annulation(s) trouvée(s)`
                });
            }
        } catch (error) {
            console.error('❌ Erreur récupération historique annulations:', error);
            if (callback) {
                callback({
                    success: false,
                    message: error.message
                });
            }
        }
    });

    // Recherche patient pour annulation
    socket.on('search_patient_for_cancellation', async (patientId, callback) => {
        try {
            const patient = await trouverPatientParCSR(patientId);
            
            if (callback) {
                callback({
                    success: true,
                    patient: patient,
                    found: patient !== null
                });
            }
        } catch (error) {
            console.error('❌ Erreur recherche patient annulation:', error);
            if (callback) {
                callback({
                    success: false,
                    message: error.message
                });
            }
        }
    });

    // Gestionnaire pour obtenir le dernier numéro client
    socket.on('get_last_client_number', async (callback) => {
        try {
            await chargerDernierNumClient();
            if (callback) {
                callback({
                    success: true,
                    lastClientNumber: dernierNumClient
                });
            }
            console.log(`📊 Dernier numéro client envoyé: ${dernierNumClient}`);
        } catch (error) {
            console.error('Erreur get_last_client_number:', error);
            if (callback) {
                callback({
                    success: false,
                    message: error.message
                });
            }
        }
    });

    // Récupérer données du journal
    socket.on('recuperer_donnees_journal', async (callback) => {
        try {
            console.log('📥 Demande de récupération des données du journal');
            
            const patients = await loadPatientData();
            
            const donneesJournal = patients.map(patient => ({
                ...patient,
                dateCreation: patient.dateCreation || patient.dateModification || new Date().toISOString(),
                total_OP: patient.total_OP || 0,
                caisseUser: patient.caisseUser || 'Non spécifié',
                isLaboratorized: patient.isLaboratorized || 'En attente'
            }));

            console.log(`✅ ${donneesJournal.length} patients chargés pour le journal`);

            if (callback) {
                callback({
                    success: true,
                    donnees: donneesJournal,
                    count: donneesJournal.length,
                    message: `${donneesJournal.length} patients chargés`
                });
            }
        } catch (error) {
            console.error('❌ Erreur récupération données journal:', error);
            if (callback) {
                callback({
                    success: false,
                    message: 'Erreur lors du chargement: ' + error.message
                });
            }
        }
    });

    // Gestionnaire pour admin login
    socket.on('admin_login', async (adminData, callback) => {
        try {
            const isValid = adminData.username === 'admin' && adminData.password === 'admin123';
            
            if (isValid) {
                await updateUserLastLogin(adminData.username);

                const userData = {
                    service: 'Administration',
                    username: adminData.username,
                    fullName: 'Administrateur Principal',
                    connectTime: new Date().toISOString(),
                    lastLogin: new Date().toISOString(),
                    isIdentified: true,
                    userId: 1
                };
                
                connectedUsers.set(socket.id, userData);
                
                await addAdminLog('Connexion administrateur: ' + adminData.username, 'admin_login', adminData.username);
                
                // Envoyer les données mises à jour
                socket.emit('examens_config_updated', examensConfig);
                socket.emit('admin_logs_history', adminLogs.slice(0, 100));
                socket.emit('server_stats', getServerStats());
                socket.emit('connected_users', getConnectedUsersByService());
                socket.emit('users_list_updated', {
                    users: usersDatabase,
                    connectedUsers: getConnectedUsersByService()
                });
                
                if (callback) {
                    callback({ success: true, message: 'Connexion réussie' });
                }
            } else {
                await addAdminLog('Tentative de connexion admin échouée: ' + adminData.username, 'security', adminData.username);
                if (callback) callback({ success: false, message: 'Identifiants incorrects' });
            }
        } catch (error) {
            console.error('Erreur admin_login:', error);
            if (callback) callback({ success: false, message: error.message });
        }
    });

    // Gestionnaire pour labo
    socket.on("labo", async (srData, callback) => {
        console.log("Tentative d'enregistrement pour: " + srData.nomClient + ', ' + srData.numID_CSR);
        console.log("Services sélectionnés:", srData.servicesSelectionnes);
        
        try {
            await ensureDirectoryExists(databasesDir);
            let patientsData = await loadPatientData();

            const patientExistantIndex = patientsData.findIndex(patient => 
                patient.numID_CSR === srData.numID_CSR
            );

            let numClientFinal = srData.numClient;

            if (patientExistantIndex !== -1) {
                numClientFinal = patientsData[patientExistantIndex].numClient;
                patientsData[patientExistantIndex] = {
                    ...patientsData[patientExistantIndex],
                    ...srData,
                    numClient: numClientFinal,
                    dateModification: new Date().toISOString()
                };
                
                await addAdminLog(
                    'Patient mis à jour: ' + srData.nomClient + ' (CSR: ' + srData.numID_CSR + ')',
                    'patient_update',
                    'Caisse'
                );
            } else {
                numClientFinal = await generateNewClientId();
                patientsData.push({
                    ...srData,
                    numClient: numClientFinal,
                    dateCreation: new Date().toISOString()
                });
                
                await addAdminLog(
                    'Nouveau patient: ' + srData.nomClient + ' (CSR: ' + srData.numID_CSR + ')',
                    'patient_create',
                    'Caisse'
                );
            }

            await fs.writeFile(LABO_FILE, JSON.stringify(patientsData, null, 2), 'utf8');
            
            if (numClientFinal > dernierNumClient) {
                dernierNumClient = numClientFinal;
                console.log('🔄 Dernier numéro client mis à jour: ' + dernierNumClient);
            }
            
            // Envoyer les données aux journaux des services
            const servicesSelectionnes = srData.servicesSelectionnes || [];
            for (const service of servicesSelectionnes) {
                try {
                    const journalData = {
                        ...srData,
                        numClient: numClientFinal,
                        service: service.value,
                        serviceName: service.name,
                        dateService: new Date().toISOString(),
                        caisseUser: srData.caisseUser || 'Utilisateur inconnu'
                    };
                    
                    socketIO.emit(`nouveau_patient_${service.value}`, journalData);
                    socketIO.emit('nouveau_patient_journal', journalData);
                    
                    console.log(`📋 Données envoyées au service ${service.name}`);
                    
                } catch (error) {
                    console.error(`❌ Erreur envoi service ${service}:`, error);
                }
            }

            socketIO.emit("nouveau_patient", {
                ...srData,
                numClient: numClientFinal,
                isLaboratorized: srData.isLaboratorized || "En attente"
            });

            if (callback) {
                callback({
                    success: true, 
                    message: "Patient enregistré avec succès",
                    numClient: numClientFinal
                });
            }
        } catch (error) {
            console.error('Erreur écriture Fichier Base de Données', error);
            
            await addAdminLog(
                'Erreur enregistrement patient: ' + error.message,
                'error',
                'Caisse'
            );
            
            if (callback) {
                callback({
                    success: false, 
                    message: "Erreur lors de l'enregistrement: " + error.message
                });
            }
        }
    });

    // Récupérer données
    socket.on('recuperer_donnees', async (callback) => {
        try {
            const donnees = await loadPatientData();
            if (callback) callback({ success: true, donnees });
        } catch (error) {
            console.error("Erreur récupération données:", error);
            if (callback) callback({ success: false, error: error.message });
        }
    });
    
    socket.on('get_next_client_id', async (callback) => {
        try {
            const nextId = await generateNewClientId();
            if (callback) callback({ success: true, nextId });
        } catch (error) {
            if (callback) callback({ success: false, message: error.message });
        }
    });
    
    socket.on('get_patient_by_csr', async (numID_CSR, callback) => {
        try {
            const patient = await trouverPatientParCSR(numID_CSR);
            if (callback) {
                callback({
                    success: true,
                    patient: patient,
                    existe: patient !== null
                });
            }
        } catch (error) {
            console.error('Erreur recherche:', error.message);
            if (callback) {
                callback({
                    success: false,
                    message: error.message
                });
            }
        }
    });
    
    socket.on("maj", () => {
        socketIO.emit("update");
    });
    
    socket.on('update_status', async ({ numClient, numID_CSR, isLaboratorized }) => {
        console.log('Tentative de mise à jour: CSR=' + numID_CSR + ', Client=' + numClient + ', Statut=' + isLaboratorized);
        
        try {
            const statusMap = {
                0: "En attente",
                1: "En cours",
                2: "Terminé",
                3: "Annulé"
            };
            const isLaboratorizedText = statusMap[isLaboratorized] || "En attente";
            
            let updatedRecord;
            
            if (numID_CSR) {
                updatedRecord = await updateLaboratorizedStatusByCSR(numID_CSR, isLaboratorizedText);
                console.log('Statut mis à jour pour ' + numID_CSR + ': ' + isLaboratorizedText);
            } else if (numClient) {
                updatedRecord = await updateLaboratorizedStatus(numClient, isLaboratorizedText);
                console.log('Statut mis à jour pour ' + numClient + ': ' + isLaboratorizedText);
            } else {
                throw new Error('Identifiant client manquant (numClient ou numID_CSR requis)');
            }

            await addAdminLog(
                'Statut patient mis à jour: ' + updatedRecord.nomClient + ' - ' + isLaboratorizedText,
                'status_update',
                'Laboratoire'
            );

            socket.emit('Mise à jour réussie', updatedRecord);
            socketIO.emit('Etat Analyses Mis à Jour', updatedRecord);

        } catch (error) {
            console.error('Erreur:', error.message);
            socket.emit('update_error', {
                numClient: numClient || numID_CSR,
                message: error.message
            });
        }
    });

    // PING/PONG
    socket.on('ping', (data) => {
        socket.emit('pong', { 
            timestamp: Date.now(),
            serverTime: new Date().toISOString(),
            received: data 
        });
    });

    // Déconnexion
    socket.on('disconnect', () => {
        console.log('🔌 Client déconnecté: ' + socket.id);
        
        const disconnectedUser = connectedUsers.get(socket.id);
        connectedUsers.delete(socket.id);
        
        if (disconnectedUser) {
            socketIO.emit('user_disconnected', {
                socketId: socket.id,
                service: disconnectedUser.service,
                username: disconnectedUser.username,
                fullName: disconnectedUser.fullName,
                connectedUsers: getConnectedUsersByService()
            });

            socketIO.emit('users_list_updated', {
                users: usersDatabase,
                connectedUsers: getConnectedUsersByService()
            });
            
            addAdminLog(
                `Déconnexion: ${disconnectedUser.username} (${disconnectedUser.service})`,
                'disconnection',
                disconnectedUser.username
            );
        }
    });
});

// ====================================================================================
// ROUTES EXPRESS POUR L'API REST
// ====================================================================================

// Route racine
app.get('/', (req, res) => {
    res.json({ 
        message: "Serveur CSR Backend en fonctionnement sur Render.com",
        status: "OK",
        server: 'csr-serveur-backend.onrender.com',
        port: PORT,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'production',
        features: {
            socketIO: 'ACTIVÉ ✅',
            apiRest: 'ACTIVÉ ✅',
            cors: 'ACTIVÉ ✅',
            healthCheck: 'ACTIVÉ ✅',
            users: usersDatabase.length,
            connected: connectedUsers.size
        },
        documentation: {
            socket: '/socket.io/',
            health: '/health',
            apiTest: '/api/test-connection',
            users: '/api/users'
        }
    });
});

// Route pour vérifier la connexion Socket.IO
app.get('/api/socket-status', (req, res) => {
    res.json({
        success: true,
        socketEnabled: true,
        connectedClients: socketIO.engine.clientsCount,
        transports: socketIO.engine.transports,
        timestamp: new Date().toISOString()
    });
});

// Route pour vérifier les credentials via API REST
app.post('/api/auth/verify', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        console.log('🔐 [API] Vérification credentials pour:', username);
        
        const user = verifyCredentials(username, password);
        
        if (user) {
            res.json({
                success: true,
                isValid: true,
                user: user,
                message: 'Authentification réussie'
            });
        } else {
            res.status(401).json({
                success: true,
                isValid: false,
                user: null,
                message: 'Nom d\'utilisateur ou mot de passe incorrect'
            });
        }
    } catch (error) {
        console.error('❌ Erreur vérification API:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur interne du serveur'
        });
    }
});

// Route pour obtenir la liste des utilisateurs
app.get('/api/users', async (req, res) => {
    try {
        res.json({
            success: true,
            users: usersDatabase,
            services: availableServices,
            count: usersDatabase.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Route pour obtenir la configuration des examens
app.get('/api/examens/config', async (req, res) => {
    try {
        res.json({
            success: true,
            examensConfig: examensConfig,
            services: getAvailableServices(),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Route pour obtenir les logs d'administration
app.get('/api/admin/logs', async (req, res) => {
    try {
        const logs = adminLogs.slice(0, 100);
        res.json({
            success: true,
            logs: logs,
            total: adminLogs.length,
            serverTime: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Route pour obtenir les statistiques
app.get('/api/admin/stats', (req, res) => {
    try {
        const stats = getServerStats();
        res.json({
            success: true,
            stats: stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Route pour les utilisateurs connectés
app.get('/api/admin/connected-users', (req, res) => {
    try {
        const users = getConnectedUsersByService();
        res.json({
            success: true,
            connectedUsers: users,
            totalConnections: connectedUsers.size
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Route pour vérifier la santé complète
app.get('/api/health/detailed', (req, res) => {
    const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        server: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cpu: process.cpuUsage(),
            env: process.env.NODE_ENV || 'development'
        },
        socket: {
            enabled: true,
            clients: socketIO.engine.clientsCount,
            transports: ['polling', 'websocket']
        },
        database: {
            users: usersDatabase.length,
            patients: dernierNumClient,
            connected: connectedUsers.size
        },
        services: {
            api: 'active',
            socket: 'active',
            auth: 'active',
            logs: 'active'
        }
    };
    
    res.json(health);
});

// Route 404 pour les routes non trouvées
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route non trouvée',
        path: req.url,
        method: req.method,
        availableRoutes: [
            '/',
            '/health',
            '/api/test-connection',
            '/api/auth/verify',
            '/api/users',
            '/api/examens/config',
            '/api/admin/logs',
            '/api/admin/stats',
            '/socket.io/'
        ]
    });
});

// ====================================================================================
// LANCEMENT DU SERVEUR
// ====================================================================================

async function startServer() {
    try {
        console.log('🚀 Démarrage du serveur Render.com...');
        
        await ensureDirectoryExists(databasesDir);
        console.log('✅ Répertoire de base de données vérifié');
        
        await initializeLaboFile();
        console.log('✅ Fichier labo initialisé');
        
        await loadAdminLogs();
        console.log('✅ Logs d\'administration chargés');
        
        await loadExamensConfig();
        console.log('✅ Configuration des examens chargée');
        
        await loadUsers();
        console.log('✅ Base de données utilisateurs chargée');
        
        const localIP = getLocalIP();
        
        // Démarrer le serveur
        http.listen(PORT, '0.0.0.0', () => {
            console.log('==========================================');
            console.log('🎉 SERVEUR RENDER.COM DÉMARRÉ AVEC SUCCÈS');
            console.log('==========================================');
            console.log('🌐 URL Publique: https://csr-serveur-backend.onrender.com');
            console.log('📡 Port: ' + PORT);
            console.log('🔌 Socket.IO: ACTIVÉ ✅');
            console.log('🚀 Transports: polling + websocket');
            console.log('🔐 CORS: ACTIVÉ pour toutes les origines');
            console.log('📊 Utilisateurs: ' + usersDatabase.length);
            console.log('👥 Utilisateurs par défaut:');
            usersDatabase.forEach(user => {
                console.log(`   • ${user.username} (${user.service}) - ${user.password}`);
            });
            console.log('==========================================');
            console.log('TEST DE CONNEXION:');
            console.log('1. Health check: https://csr-serveur-backend.onrender.com/health');
            console.log('2. Socket.IO: https://csr-serveur-backend.onrender.com/socket.io/');
            console.log('3. Test API: https://csr-serveur-backend.onrender.com/api/test-connection');
            console.log('==========================================');
            
            addAdminLog('Serveur démarré sur Render.com', 'server_start', 'system');
        });
    } catch (error) {
        console.error('❌ Erreur lors du démarrage du serveur:', error);
        process.exit(1);
    }
}

// Gestion des signaux pour un arrêt propre
process.on('SIGINT', () => {
    console.log('🔻 Arrêt du serveur...');
    addAdminLog('Serveur arrêté', 'server_stop', 'system');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('🔻 Arrêt du serveur (SIGTERM)...');
    addAdminLog('Serveur arrêté par SIGTERM', 'server_stop', 'system');
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('💥 Exception non capturée:', error);
    addAdminLog('Exception non capturée: ' + error.message, 'error', 'system');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Rejet non géré:', reason);
    addAdminLog('Rejet non géré: ' + reason, 'error', 'system');
});

// Démarrer le serveur
startServer();
