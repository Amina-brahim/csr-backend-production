const express = require('express');
const app = express();
const cors = require("cors");
const http = require('http').Server(app);
const PORT = process.env.PORT || 4600;
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// ====================================================================================
// CORRECTION DES CHEMINS - VERSION DÉFINITIVE POUR csr-backend-production
// ====================================================================================

// CHEMIN ABSOLU FIXE - LA BONNE STRUCTURE
const BASE_DATABASE_PATH = 'csr-backend-production/databases/databases';

console.log('🔧 [CONFIG] Configuration des chemins de base de données...');
console.log('=========================================================');
console.log(`   • BASE_DATABASE_PATH: ${BASE_DATABASE_PATH}`);
console.log(`   • process.cwd(): ${process.cwd()}`);
console.log(`   • __dirname: ${__dirname}`);
console.log('=========================================================');

// Fonction pour obtenir le chemin absolu CORRECT
const getDatabasePath = (filename) => {
    const fullPath = path.resolve(BASE_DATABASE_PATH);
    const filePath = path.join(fullPath, filename);
    return filePath;
};

// CHEMINS DES FICHIERS - AVEC LE BON CHEMIN
const LABO_FILE = getDatabasePath('labo.json');
const JOURNAL_LABO_FILE = getDatabasePath('journal_laboratoire.json');
const JOURNAL_CONSULT_FILE = getDatabasePath('journal_consultation.json');
const JOURNAL_CAISSE_FILE = getDatabasePath('journal_caisse.json');
const ADMIN_LOG_FILE = getDatabasePath('admin_logs.json');
const EXAMENS_CONFIG_FILE = getDatabasePath('examens_config.json');
const USERS_FILE = getDatabasePath('users.json');
const LAST_CLIENT_NUMBER_FILE = getDatabasePath('last_client_number.json');
const CLIENT_NUMBER_BACKUP_FILE = getDatabasePath('client_number_backup.json');
const PAYMENT_CANCELLATIONS_FILE = getDatabasePath('payment_cancellations.json');

// Afficher tous les chemins pour vérification
console.log('📁 CHEMINS CONFIGURÉS:');
console.log('=========================================================');
console.log(`   • LABO_FILE: ${LABO_FILE}`);
console.log(`   • JOURNAL_LABO_FILE: ${JOURNAL_LABO_FILE}`);
console.log(`   • JOURNAL_CONSULT_FILE: ${JOURNAL_CONSULT_FILE}`);
console.log(`   • JOURNAL_CAISSE_FILE: ${JOURNAL_CAISSE_FILE}`);
console.log(`   • USERS_FILE: ${USERS_FILE}`);
console.log('=========================================================');

// ====================================================================================
// FONCTIONS UTILITAIRES POUR LA GESTION DES DOSSIERS
// ====================================================================================

// Vérifier et créer le dossier de base de données
const ensureDatabaseDirectory = async () => {
    try {
        const fullPath = path.resolve(BASE_DATABASE_PATH);
        console.log(`📁 [DIR] Vérification du dossier: ${fullPath}`);
        
        try {
            await fs.access(fullPath);
            console.log(`✅ [DIR] Dossier trouvé: ${fullPath}`);
            
            // Lister les fichiers existants
            const files = await fs.readdir(fullPath);
            console.log(`📊 [DIR] ${files.length} fichiers trouvés dans le dossier`);
            if (files.length > 0) {
                console.log(`   • Fichiers: ${files.join(', ')}`);
            }
        } catch (error) {
            console.log(`📂 [DIR] Création du dossier: ${fullPath}`);
            await fs.mkdir(fullPath, { recursive: true });
            console.log(`✅ [DIR] Dossier créé: ${fullPath}`);
        }
        
        return fullPath;
    } catch (error) {
        console.error(`❌ [DIR] Erreur création dossier: ${error.message}`);
        throw error;
    }
};

// Créer tous les fichiers s'ils n'existent pas
const initializeDatabaseFiles = async () => {
    try {
        const fullPath = path.resolve(BASE_DATABASE_PATH);
        
        console.log('\n📄 INITIALISATION DES FICHIERS:');
        console.log('=========================================================');
        
        const filesToCreate = [
            { path: JOURNAL_LABO_FILE, name: 'journal_laboratoire.json', default: '[]' },
            { path: JOURNAL_CONSULT_FILE, name: 'journal_consultation.json', default: '[]' },
            { path: JOURNAL_CAISSE_FILE, name: 'journal_caisse.json', default: '[]' },
            { path: LABO_FILE, name: 'labo.json', default: '[]' },
            { path: USERS_FILE, name: 'users.json', default: '[]' },
            { path: ADMIN_LOG_FILE, name: 'admin_logs.json', default: '[]' },
            { path: EXAMENS_CONFIG_FILE, name: 'examens_config.json', default: '{}' },
            { path: LAST_CLIENT_NUMBER_FILE, name: 'last_client_number.json', default: JSON.stringify({ lastClientNumber: 0, updatedAt: new Date().toISOString() }) }
        ];
        
        for (const file of filesToCreate) {
            try {
                await fs.access(file.path);
                const content = await fs.readFile(file.path, 'utf8');
                const size = content.length;
                console.log(`✅ ${file.name}: Existe (${size} octets)`);
                
                // Vérifier si le fichier est vide
                if (!content.trim()) {
                    console.log(`⚠️  ${file.name}: Fichier vide, réinitialisation...`);
                    await fs.writeFile(file.path, file.default);
                }
            } catch (error) {
                if (error.code === 'ENOENT') {
                    console.log(`📄 ${file.name}: Création...`);
                    await fs.writeFile(file.path, file.default);
                    console.log(`✅ ${file.name}: Créé avec succès`);
                } else {
                    console.error(`❌ ${file.name}: ${error.message}`);
                }
            }
        }
        
        console.log('✅ Tous les fichiers sont initialisés');
        console.log('=========================================================\n');
        
    } catch (error) {
        console.error(`❌ Erreur initialisation fichiers: ${error.message}`);
        throw error;
    }
};

// ====================================================================================
// CONFIGURATION CORS CRITIQUE : Liste blanche pour Vercel + Render
// ====================================================================================

const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://csr-system.vercel.app',
    'https://csr-frontend.onrender.com',
    'https://csr-frontend-*.onrender.com',
    'https://*.onrender.com'
];

// Middleware CORS pour Express
const corsOptions = {
    origin: function (origin, callback) {
        if (!origin) {
            console.log('🌐 Requête sans origine (probablement serveur à serveur)');
            return callback(null, true);
        }
        
        const isAllowed = allowedOrigins.some(allowed => {
            if (allowed === origin) return true;
            
            if (allowed.includes('*')) {
                const escaped = allowed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const pattern = escaped.replace('\\*', '.*');
                return new RegExp(`^${pattern}$`).test(origin);
            }
            
            return false;
        });
        
        if (isAllowed) {
            console.log(`✅ CORS autorisé pour: ${origin}`);
            callback(null, true);
        } else {
            console.log(`🚫 CORS BLOQUÉ pour: ${origin}`);
            callback(new Error(`Origine non autorisée: ${origin}`));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Socket-ID']
};

// Appliquez le middleware CORS
app.use(cors(corsOptions));

// Middleware pour parser JSON
app.use(express.json());

// Middleware personnalisé pour CORS headers
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
// CONFIGURATION SOCKET.IO POUR RENDER.COM
// ====================================================================================

const socketIO = require('socket.io')(http, {
    cors: {
        origin: function(origin, callback) {
            if (!origin) {
                console.log('📡 Socket.IO: Requête sans origine');
                return callback(null, true);
            }
            
            const isOriginAllowed = allowedOrigins.some(allowed => {
                if (allowed === origin) return true;
                if (allowed.includes('*')) {
                    return origin.includes(allowed.replace('*', ''));
                }
                return false;
            });
            
            if (isOriginAllowed) {
                console.log(`📡 Socket.IO: Origine autorisée - ${origin}`);
                callback(null, true);
            } else {
                console.log(`🚫 Socket.IO: Origine BLOQUÉE - ${origin}`);
                callback(new Error('Origin not allowed'));
            }
        },
        methods: ["GET", "POST"],
        credentials: true,
        allowedHeaders: ["Content-Type", "Authorization"]
    },
    transports: ['polling', 'websocket'],
    allowUpgrades: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 1e8,
    connectTimeout: 45000,
    allowEIO3: true,
    cookie: false
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
// FONCTIONS UTILITAIRES MANQUANTES - AJOUTÉES
// ====================================================================================

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

// FONCTION DETERMINE SERVICE MANQUANTE - AJOUTÉE
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

// ====================================================================================
// FONCTION POUR RÉINITIALISER LES UTILISATEURS
// ====================================================================================

let usersDatabase = [];

const initializeUsersDatabase = async () => {
    try {
        console.log('🔄 Initialisation de la base utilisateurs...');
        
        // Liste complète des utilisateurs avec mot de passe UNIQUE "12345678" pour tous
        const defaultUsers = [
            {
                id: 1,
                username: "admin",
                password: "12345678",
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
                password: "12345678",
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
                password: "12345678",
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
            },
            {
                id: 7,
                username: "Radiologie",
                password: "12345678",
                service: "Radiologie",
                fullName: "Technicien Radiologie",
                email: "",
                isActive: true,
                createdAt: new Date().toISOString(),
                lastLogin: null,
                permissions: ["radiologie", "view"]
            },
            {
                id: 8,
                username: "Pharmacie",
                password: "12345678",
                service: "Pharmacie",
                fullName: "Pharmacien",
                email: "",
                isActive: true,
                createdAt: new Date().toISOString(),
                lastLogin: null,
                permissions: ["pharmacie", "view"]
            }
        ];
        
        // Sauvegarder dans le fichier
        await fs.writeFile(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
        
        usersDatabase = defaultUsers;
        console.log(`✅ ${defaultUsers.length} utilisateurs réinitialisés`);
        
        // Afficher les identifiants
        console.log('📋 Identifiants disponibles (mot de passe: 12345678 pour tous):');
        defaultUsers.forEach(user => {
            console.log(`   • ${user.username} (${user.service})`);
        });
    } catch (error) {
        console.error('❌ Erreur initialisation utilisateurs:', error);
    }
};

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

// ====================================================================================
// FONCTIONS PERSISTANCE DES NUMEROS CLIENTS
// ====================================================================================

// Fonction pour sauvegarder le dernier numéro de client
const saveLastClientNumber = async () => {
    let lockAcquired = false;
    try {
        await acquireLock(LAST_CLIENT_NUMBER_FILE);
        lockAcquired = true;
        
        const dataToSave = {
            lastClientNumber: dernierNumClient,
            updatedAt: new Date().toISOString(),
            server: 'csr-backend',
            description: 'Dernier numéro de client attribué - NE PAS MODIFIER MANUELLEMENT',
            checksum: `CSR_${dernierNumClient}_${Date.now()}`
        };
        
        // Écrire dans un fichier temporaire d'abord
        const tmpFile = LAST_CLIENT_NUMBER_FILE + '.tmp';
        await fs.writeFile(tmpFile, JSON.stringify(dataToSave, null, 2));
        
        // Remplacer l'ancien fichier
        await fs.rename(tmpFile, LAST_CLIENT_NUMBER_FILE);
        
        console.log(`💾 Dernier numéro client sauvegardé: ${dernierNumClient} (${new Date().toLocaleTimeString()})`);
        
    } catch (error) {
        console.error('❌ Erreur sauvegarde dernier numéro client:', error);
        throw error;
    } finally {
        if (lockAcquired) {
            releaseLock(LAST_CLIENT_NUMBER_FILE);
        }
    }
};

// Fonction pour charger le dernier numéro de client depuis le fichier
const loadLastClientNumber = async () => {
    try {
        await fs.access(LAST_CLIENT_NUMBER_FILE);
        const data = await fs.readFile(LAST_CLIENT_NUMBER_FILE, 'utf8');
        if (data.trim()) {
            const savedData = JSON.parse(data);
            const previousValue = dernierNumClient;
            dernierNumClient = savedData.lastClientNumber || 0;
            
            console.log(`📊 Dernier numéro client chargé: ${previousValue} → ${dernierNumClient}`);
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('📁 Fichier dernier numéro client non trouvé, création...');
            await saveLastClientNumber();
        } else {
            console.error('❌ Erreur chargement dernier numéro client:', error);
            dernierNumClient = 0;
        }
    }
};

// Générer un nouvel ID client
const generateNewClientId = async () => {
    let lockAcquired = false;
    try {
        await acquireLock(LAST_CLIENT_NUMBER_FILE);
        lockAcquired = true;
        
        await loadLastClientNumber();
        
        dernierNumClient++;
        
        await saveLastClientNumber();
        
        console.log('✅ Nouveau numéro client généré et sauvegardé: ' + dernierNumClient);
        
        return dernierNumClient;
    } catch (error) {
        console.error('❌ Erreur génération ID:', error);
        return Date.now() % 1000000;
    } finally {
        if (lockAcquired) {
            releaseLock(LAST_CLIENT_NUMBER_FILE);
        }
    }
};

// Fonction pour forcer la synchronisation
const forceSyncClientNumbers = async () => {
    try {
        console.log('🔄 Forçage de la synchronisation des numéros...');
        
        const patients = await loadPatientData();
        
        if (patients.length === 0) {
            console.log('📭 Aucun patient trouvé, numéro client à 0');
            dernierNumClient = 0;
            await saveLastClientNumber();
            return 0;
        }
        
        let maxNumClient = 0;
        patients.forEach(patient => {
            const num = parseInt(patient.numClient);
            if (!isNaN(num) && num > maxNumClient) {
                maxNumClient = num;
            }
        });
        
        const previousValue = dernierNumClient;
        dernierNumClient = maxNumClient;
        
        await saveLastClientNumber();
        
        console.log(`✅ Synchronisation: ${previousValue} → ${dernierNumClient} (${patients.length} patients)`);
        
        return dernierNumClient;
    } catch (error) {
        console.error('❌ Erreur synchronisation forcée:', error);
        throw error;
    }
};

// ====================================================================================
// FONCTION ADD TO JOURNAL - VERSION CORRIGÉE POUR LE BON CHEMIN
// ====================================================================================

const addToJournal = async (journalFile, entry) => {
    console.log('\n📝 [JOURNAL] ==============================================');
    console.log(`📝 [JOURNAL] Début ajout au journal...`);
    console.log(`📝 [JOURNAL] Fichier cible: ${journalFile}`);
    
    try {
        // 1. Vérifier le chemin du fichier
        const resolvedPath = path.resolve(journalFile);
        console.log(`📝 [JOURNAL] Chemin résolu: ${resolvedPath}`);
        
        // 2. Vérifier que le dossier existe
        const dirPath = path.dirname(resolvedPath);
        try {
            await fs.access(dirPath);
            console.log(`✅ [JOURNAL] Dossier existe: ${dirPath}`);
        } catch {
            console.log(`📂 [JOURNAL] Création dossier: ${dirPath}`);
            await fs.mkdir(dirPath, { recursive: true });
        }
        
        // 3. Lire le fichier ou créer s'il n'existe pas
        let journalData;
        try {
            await fs.access(resolvedPath);
            const fileContent = await fs.readFile(resolvedPath, 'utf8');
            console.log(`✅ [JOURNAL] Fichier trouvé, taille: ${fileContent.length} caractères`);
            
            if (!fileContent.trim()) {
                journalData = [];
                console.log('⚠️ [JOURNAL] Fichier vide, initialisation tableau');
            } else {
                journalData = JSON.parse(fileContent);
                console.log(`✅ [JOURNAL] ${journalData.length} entrées chargées`);
            }
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log(`📄 [JOURNAL] Création nouveau fichier: ${resolvedPath}`);
                journalData = [];
                await fs.writeFile(resolvedPath, JSON.stringify([], null, 2));
            } else {
                throw error;
            }
        }
        
        // 4. Créer l'entrée avec toutes les informations
        const journalEntry = {
            ...entry,
            journalId: `JRN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            journalTimestamp: new Date().toISOString(),
            addedAt: new Date().toLocaleString('fr-FR'),
            addedBy: entry.caisseUser || 'Système',
            patientName: entry.patientName || entry.nomClient || 'Inconnu',
            patientId: entry.patientId || entry.numID_CSR || 'N/A',
            filePath: resolvedPath
        };
        
        console.log(`📋 [JOURNAL] Données entrée:`);
        console.log(`   • Patient: ${journalEntry.patientName}`);
        console.log(`   • ID CSR: ${journalEntry.patientId}`);
        console.log(`   • Service: ${journalEntry.service || 'N/A'}`);
        console.log(`   • Date: ${journalEntry.addedAt}`);
        
        // 5. Ajouter au journal
        journalData.unshift(journalEntry);
        
        // 6. Écrire dans le fichier
        await fs.writeFile(resolvedPath, JSON.stringify(journalData, null, 2));
        
        console.log(`✅✅✅ [JOURNAL] ÉCRITURE RÉUSSIE`);
        console.log(`   • Fichier: ${path.basename(resolvedPath)}`);
        console.log(`   • Chemin: ${resolvedPath}`);
        console.log(`   • Nouvelles entrées: ${journalData.length}`);
        
        // 7. Vérifier que le fichier a bien été écrit
        try {
            const verifyContent = await fs.readFile(resolvedPath, 'utf8');
            const verifyData = JSON.parse(verifyContent);
            console.log(`✅ [JOURNAL] Vérification: ${verifyData.length} entrées dans le fichier`);
        } catch (verifyError) {
            console.error(`❌ [JOURNAL] Erreur vérification écriture: ${verifyError.message}`);
        }
        
        console.log('📝 [JOURNAL] ==============================================\n');
        
        return journalEntry;
        
    } catch (error) {
        console.error(`❌❌❌ [JOURNAL] ERREUR CRITIQUE DANS addToJournal:`);
        console.error(`   • Fichier: ${journalFile}`);
        console.error(`   • Chemin résolu: ${path.resolve(journalFile)}`);
        console.error(`   • Erreur: ${error.message}`);
        
        throw error;
    }
};

// ====================================================================================
// FONCTIONS UTILITAIRES - CORRIGÉES POUR LES BONS CHEMINS
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
            console.log('📁 Fichier de configuration des examens créé');
        } else {
            console.error('❌ Erreur chargement configuration examens:', error);
        }
    }
};

// Charger les données des patients
const loadPatientData = async () => {
    try {
        await fs.access(LABO_FILE);
        const data = await fs.readFile(LABO_FILE, 'utf8');
        if (!data.trim()) return [];
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.writeFile(LABO_FILE, '[]');
            console.log('📁 Fichier labo.json créé');
            return [];
        }
        throw error;
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

// ====================================================================================
// GESTION DES UTILISATEURS - CORRIGÉE
// ====================================================================================

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
            console.log('📁 Fichier utilisateurs non trouvé');
        } else {
            console.error('❌ Erreur chargement utilisateurs:', error);
        }
    }
};

// FONCTION VERIFY CREDENTIALS
const verifyCredentials = (username, password) => {
    console.log('🔐 [SERVER] Vérification credentials pour:', username);
    
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

// ====================================================================================
// SOCKET.IO HANDLERS - COMPLET AVEC CORRECTION DES JOURNAUX
// ====================================================================================

socketIO.on('connection', (socket) => {
    console.log('✅✅✅ NOUVELLE CONNEXION Socket.io: ' + socket.id);
    
    // Envoyer immédiatement les infos de connexion
    socket.emit('server_info', {
        serverIP: 'csr-backend-production.onrender.com',
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

    // ============================================================================
    // GESTIONNAIRE ADD_TO_JOURNAL CORRIGÉ
    // ============================================================================

    socket.on('add_to_journal', async (data, callback) => {
        console.log('\n📡 [SOCKET] ==============================================');
        console.log('📡 [SOCKET] Événement add_to_journal reçu');
        console.log(`📡 [SOCKET] Type: ${data.journalType}`);
        console.log(`📡 [SOCKET] Socket ID: ${socket.id}`);
        
        try {
            const { journalType, entry } = data;
            
            if (!journalType || !entry) {
                throw new Error('Données manquantes: journalType et entry sont requis');
            }
            
            // DÉTERMINER LE FICHIER EXACT
            let journalFile;
            switch (journalType.toLowerCase()) {
                case 'laboratoire':
                    journalFile = JOURNAL_LABO_FILE;
                    console.log(`🔧 [SOCKET] Journal sélectionné: laboratoire`);
                    break;
                case 'consultation':
                    journalFile = JOURNAL_CONSULT_FILE;
                    console.log(`🔧 [SOCKET] Journal sélectionné: consultation`);
                    break;
                case 'caisse':
                    journalFile = JOURNAL_CAISSE_FILE;
                    console.log(`🔧 [SOCKET] Journal sélectionné: caisse`);
                    break;
                default:
                    console.error(`❌ [SOCKET] Type de journal inconnu: ${journalType}`);
                    throw new Error(`Type de journal non reconnu: ${journalType}`);
            }
            
            console.log(`📁 [SOCKET] Fichier: ${journalFile}`);
            console.log(`📍 [SOCKET] Chemin complet: ${path.resolve(journalFile)}`);
            
            // Ajouter des informations supplémentaires à l'entrée
            const enhancedEntry = {
                ...entry,
                socketId: socket.id,
                receivedAt: new Date().toISOString(),
                journalType: journalType,
                patientName: entry.patientName || entry.nomClient || 'Patient sans nom',
                patientId: entry.patientId || entry.numID_CSR || 'N/A'
            };
            
            // APPEL À LA FONCTION addToJournal
            console.log('📝 [SOCKET] Appel de addToJournal...');
            const journalEntry = await addToJournal(journalFile, enhancedEntry);
            
            // DIFFUSER LA MISE À JOUR À TOUS LES CLIENTS
            console.log(`📢 [SOCKET] Diffusion aux clients...`);
            
            socketIO.emit(`journal_updated_${journalType}`, {
                type: journalType,
                entry: journalEntry,
                timestamp: new Date().toISOString(),
                message: `Nouvelle entrée dans ${journalType}`
            });
            
            socketIO.emit('journal_updated', {
                journalType: journalType,
                entry: journalEntry,
                serverTime: new Date().toISOString()
            });
            
            console.log(`✅✅✅ [SOCKET] JOURNAL MIS À JOUR AVEC SUCCÈS`);
            console.log(`📡 [SOCKET] ==============================================\n`);
            
            // Réponse au client
            if (callback) {
                callback({
                    success: true,
                    message: `Entrée ajoutée au journal ${journalType}`,
                    entry: journalEntry,
                    filePath: path.resolve(journalFile),
                    timestamp: new Date().toISOString()
                });
            }
            
        } catch (error) {
            console.error('❌❌❌ [SOCKET] ERREUR add_to_journal:');
            console.error(`   • Message: ${error.message}`);
            
            // Réponse d'erreur détaillée
            if (callback) {
                callback({
                    success: false,
                    message: `Échec de l'ajout au journal: ${error.message}`,
                    errorCode: error.code || 'UNKNOWN',
                    timestamp: new Date().toISOString()
                });
            }
        }
    });

    // ============================================================================
    // AUTRES GESTIONNAIRES SOCKET.IO
    // ============================================================================

    socket.on('verify_user_credentials', async (credentials, callback) => {
        try {
            console.log('🔐 [SERVER] Vérification credentials reçue:', credentials);
            
            if (!credentials || !credentials.username || !credentials.password) {
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

    socket.on('get_last_client_number', async (callback) => {
        try {
            console.log('📊 [SERVER] Demande du dernier numéro client');
            
            await loadLastClientNumber();
            
            if (callback) {
                callback({
                    success: true,
                    lastClientNumber: dernierNumClient,
                    message: `Dernier numéro client: ${dernierNumClient}`,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error) {
            console.error('❌ Erreur récupération dernier numéro client:', error);
            if (callback) {
                callback({
                    success: false,
                    lastClientNumber: 0,
                    message: error.message
                });
            }
        }
    });

    socket.on('get_journal', async (data, callback) => {
        try {
            console.log('📋 Demande de récupération de journal:', data);
            
            const { journalType, limit = 100 } = data;
            
            if (!journalType) {
                throw new Error('Type de journal requis');
            }
            
            let journalFile;
            switch (journalType) {
                case 'laboratoire':
                    journalFile = JOURNAL_LABO_FILE;
                    break;
                case 'consultation':
                    journalFile = JOURNAL_CONSULT_FILE;
                    break;
                case 'caisse':
                    journalFile = JOURNAL_CAISSE_FILE;
                    break;
                default:
                    throw new Error('Type de journal non reconnu');
            }
            
            const journalData = await loadJournalData(journalFile);
            const limitedData = journalData.slice(0, limit);
            
            if (callback) {
                callback({
                    success: true,
                    journalType,
                    entries: limitedData,
                    total: journalData.length,
                    limit: limit
                });
            }
        } catch (error) {
            console.error('❌ Erreur récupération journal:', error);
            if (callback) {
                callback({
                    success: false,
                    message: error.message
                });
            }
        }
    });

    socket.on("labo", async (srData, callback) => {
        console.log("Tentative d'enregistrement pour: " + srData.nomClient + ', ' + srData.numID_CSR);
        
        try {
            let patientsData = await loadPatientData();

            const patientExistantIndex = patientsData.findIndex(patient => 
                patient.numID_CSR === srData.numID_CSR
            );

            let numClientFinal;

            if (patientExistantIndex !== -1) {
                numClientFinal = patientsData[patientExistantIndex].numClient;
                patientsData[patientExistantIndex] = {
                    ...patientsData[patientExistantIndex],
                    ...srData,
                    numClient: numClientFinal,
                    dateModification: new Date().toISOString()
                };
                
                console.log(`✅ Patient mis à jour: ${srData.nomClient} (numéro: ${numClientFinal})`);
            } else {
                if (!srData.numClient || srData.numClient === '0' || srData.numClient === 0) {
                    numClientFinal = await generateNewClientId();
                    console.log(`🆕 Nouveau numéro généré: ${numClientFinal} pour ${srData.nomClient}`);
                } else {
                    numClientFinal = srData.numClient;
                    if (numClientFinal > dernierNumClient) {
                        dernierNumClient = numClientFinal;
                        await saveLastClientNumber();
                        console.log(`🔄 Numéro client mis à jour: ${dernierNumClient}`);
                    }
                }
                
                patientsData.push({
                    ...srData,
                    numClient: numClientFinal,
                    dateCreation: new Date().toISOString()
                });
                
                console.log(`✅ Nouveau patient: ${srData.nomClient} (numéro: ${numClientFinal})`);
                
                // AJOUTER AUX JOURNAUX DES SERVICES
                const servicesSelectionnes = srData.servicesSelectionnes || [];
                for (const service of servicesSelectionnes) {
                    try {
                        const serviceName = typeof service === 'object' ? service.value : service;
                        const journalEntry = {
                            ...srData,
                            numClient: numClientFinal,
                            service: serviceName,
                            serviceName: typeof service === 'object' ? service.name : service,
                            dateService: new Date().toISOString(),
                            caisseUser: srData.caisseUser || 'Utilisateur inconnu',
                            patientName: srData.nomClient,
                            patientId: srData.numID_CSR
                        };
                        
                        switch (serviceName) {
                            case 'laboratoire':
                                await addToJournal(JOURNAL_LABO_FILE, journalEntry);
                                break;
                            case 'consultation':
                                await addToJournal(JOURNAL_CONSULT_FILE, journalEntry);
                                break;
                            case 'caisse':
                                await addToJournal(JOURNAL_CAISSE_FILE, journalEntry);
                                break;
                        }
                        
                    } catch (error) {
                        console.error(`❌ Erreur envoi service ${service}:`, error);
                    }
                }
            }

            await fs.writeFile(LABO_FILE, JSON.stringify(patientsData, null, 2), 'utf8');
            
            if (numClientFinal > dernierNumClient) {
                dernierNumClient = numClientFinal;
                await saveLastClientNumber();
                console.log('🔄 Dernier numéro client mis à jour: ' + dernierNumClient);
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
            
            if (callback) {
                callback({
                    success: false, 
                    message: "Erreur lors de l'enregistrement: " + error.message
                });
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('🔌 Client déconnecté: ' + socket.id);
        
        const disconnectedUser = connectedUsers.get(socket.id);
        connectedUsers.delete(socket.id);
        
        if (disconnectedUser) {
            console.log(`👤 Utilisateur déconnecté: ${disconnectedUser.username} (${disconnectedUser.service})`);
        }
    });
});

// ====================================================================================
// ROUTES EXPRESS POUR L'API REST
// ====================================================================================

// Route racine
app.get('/', (req, res) => {
    res.json({ 
        message: "Serveur CSR Backend en fonctionnement",
        status: "OK",
        server: 'csr-backend-production.onrender.com',
        port: PORT,
        timestamp: new Date().toISOString(),
        databasePath: BASE_DATABASE_PATH
    });
});

// Route de santé OBLIGATOIRE pour Render
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        server: 'CSR Backend',
        port: PORT,
        databasePath: BASE_DATABASE_PATH
    });
});

// Route pour vérifier la connexion Socket.IO
app.get('/api/socket-status', (req, res) => {
    res.json({
        success: true,
        socketEnabled: true,
        connectedClients: socketIO.engine.clientsCount,
        databasePath: BASE_DATABASE_PATH,
        timestamp: new Date().toISOString()
    });
});

// Route pour obtenir un journal spécifique
app.get('/api/journals/:journalType', async (req, res) => {
    try {
        const { journalType } = req.params;
        const { limit = 100 } = req.query;
        
        let journalFile;
        switch (journalType) {
            case 'laboratoire':
                journalFile = JOURNAL_LABO_FILE;
                break;
            case 'consultation':
                journalFile = JOURNAL_CONSULT_FILE;
                break;
            case 'caisse':
                journalFile = JOURNAL_CAISSE_FILE;
                break;
            default:
                return res.status(400).json({
                    success: false,
                    message: 'Type de journal non reconnu'
                });
        }
        
        // Charger les données du journal
        let journalData;
        try {
            await fs.access(journalFile);
            const fileContent = await fs.readFile(journalFile, 'utf8');
            journalData = fileContent.trim() ? JSON.parse(fileContent) : [];
        } catch {
            journalData = [];
        }
        
        const limitedData = journalData.slice(0, parseInt(limit));
        
        res.json({
            success: true,
            journalType,
            entries: limitedData,
            total: journalData.length,
            limit: parseInt(limit),
            filePath: journalFile
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Route pour ajouter une entrée à un journal
app.post('/api/journals/:journalType', async (req, res) => {
    try {
        const { journalType } = req.params;
        const entry = req.body;
        
        if (!entry) {
            return res.status(400).json({
                success: false,
                message: 'Entrée requise'
            });
        }
        
        let journalFile;
        switch (journalType) {
            case 'laboratoire':
                journalFile = JOURNAL_LABO_FILE;
                break;
            case 'consultation':
                journalFile = JOURNAL_CONSULT_FILE;
                break;
            case 'caisse':
                journalFile = JOURNAL_CAISSE_FILE;
                break;
            default:
                return res.status(400).json({
                    success: false,
                    message: 'Type de journal non reconnu'
                });
        }
        
        const journalEntry = await addToJournal(journalFile, entry);
        
        socketIO.emit(`journal_updated_${journalType}`, journalEntry);
        
        res.json({
            success: true,
            message: 'Entrée ajoutée au journal',
            entry: journalEntry,
            filePath: journalFile
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Route pour vérifier les chemins
app.get('/api/debug/paths', (req, res) => {
    const paths = {
        BASE_DATABASE_PATH,
        LABO_FILE,
        JOURNAL_LABO_FILE,
        JOURNAL_CONSULT_FILE,
        JOURNAL_CAISSE_FILE,
        USERS_FILE,
        process_cwd: process.cwd(),
        __dirname: __dirname,
        resolved_paths: {
            labo: path.resolve(LABO_FILE),
            journal_labo: path.resolve(JOURNAL_LABO_FILE),
            journal_consult: path.resolve(JOURNAL_CONSULT_FILE),
            journal_caisse: path.resolve(JOURNAL_CAISSE_FILE)
        }
    };
    
    res.json({
        success: true,
        paths: paths,
        timestamp: new Date().toISOString()
    });
});

// ====================================================================================
// FONCTION DE VÉRIFICATION DES CHEMINS
// ====================================================================================

async function verifyAllPaths() {
    console.log('\n🔍 VÉRIFICATION DES CHEMINS:');
    console.log('=========================================================');
    
    const allFiles = [
        { name: 'JOURNAL_LABO', path: JOURNAL_LABO_FILE },
        { name: 'JOURNAL_CONSULT', path: JOURNAL_CONSULT_FILE },
        { name: 'JOURNAL_CAISSE', path: JOURNAL_CAISSE_FILE },
        { name: 'LABO', path: LABO_FILE },
        { name: 'USERS', path: USERS_FILE }
    ];
    
    for (const file of allFiles) {
        console.log(`\n📁 ${file.name}:`);
        console.log(`   • Chemin configuré: ${file.path}`);
        console.log(`   • Chemin résolu: ${path.resolve(file.path)}`);
        
        try {
            await fs.access(path.resolve(file.path));
            const content = await fs.readFile(path.resolve(file.path), 'utf8');
            const data = content.trim() ? JSON.parse(content) : [];
            console.log(`   ✅ EXISTE - ${data.length} entrées`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log(`   ❌ N'EXISTE PAS - création...`);
                try {
                    const dir = path.dirname(path.resolve(file.path));
                    await fs.mkdir(dir, { recursive: true });
                    await fs.writeFile(path.resolve(file.path), '[]');
                    console.log(`   ✅ CRÉÉ avec succès`);
                } catch (createError) {
                    console.log(`   ❌ Échec création: ${createError.message}`);
                }
            } else {
                console.log(`   ❌ ERREUR: ${error.message}`);
            }
        }
    }
    
    console.log('\n=========================================================');
    console.log('✅ VÉRIFICATION TERMINÉE');
}

// ====================================================================================
// LANCEMENT DU SERVEUR
// ====================================================================================

async function startServer() {
    try {
        console.log('🚀 Démarrage du serveur...');
        console.log('=========================================================\n');
        
        // 1. Vérifier et créer les dossiers
        await ensureDatabaseDirectory();
        
        // 2. Initialiser tous les fichiers
        await initializeDatabaseFiles();
        
        // 3. Vérifier tous les chemins
        await verifyAllPaths();
        
        // 4. Initialiser les utilisateurs
        await initializeUsersDatabase();
        
        // 5. Charger les données
        await loadUsers();
        await loadAdminLogs();
        await loadExamensConfig();
        
        // 6. Synchroniser les numéros clients
        await forceSyncClientNumbers();
        
        // 7. Vérifier que les fichiers journaux sont accessibles
        console.log('\n📊 ÉTAT DES JOURNAUX:');
        console.log('=========================================================');
        const journals = [
            { name: 'Laboratoire', file: JOURNAL_LABO_FILE },
            { name: 'Consultation', file: JOURNAL_CONSULT_FILE },
            { name: 'Caisse', file: JOURNAL_CAISSE_FILE }
        ];
        
        for (const journal of journals) {
            try {
                const content = await fs.readFile(journal.file, 'utf8');
                const data = content.trim() ? JSON.parse(content) : [];
                console.log(`   • ${journal.name}: ${data.length} entrées (${journal.file})`);
            } catch {
                console.log(`   • ${journal.name}: 0 entrées (fichier vide ou inexistant)`);
            }
        }
        
        // Démarrer le serveur
        http.listen(PORT, '0.0.0.0', () => {
            console.log('\n=========================================================');
            console.log('🎉 SERVEUR DÉMARRÉ AVEC SUCCÈS');
            console.log('=========================================================');
            console.log(`📡 Port: ${PORT}`);
            console.log(`📁 Base de données: ${BASE_DATABASE_PATH}`);
            console.log(`🔌 Socket.IO: ACTIVÉ ✅`);
            console.log(`📊 Utilisateurs: ${usersDatabase.length}`);
            console.log(`🔢 Dernier numéro client: ${dernierNumClient}`);
            console.log('🔐 Identifiants disponibles:');
            console.log('   • Tous les utilisateurs ont le mot de passe: 12345678');
            console.log('   • Utilisateurs principaux: admin, Caisse, Labo, Consultation');
            console.log('📝 Journaux disponibles:');
            console.log(`   • Laboratoire: ${JOURNAL_LABO_FILE}`);
            console.log(`   • Consultation: ${JOURNAL_CONSULT_FILE}`);
            console.log(`   • Caisse: ${JOURNAL_CAISSE_FILE}`);
            console.log('=========================================================\n');
            
            addAdminLog('Serveur démarré', 'server_start', 'system');
        });
    } catch (error) {
        console.error('❌ Erreur lors du démarrage du serveur:', error);
        process.exit(1);
    }
}

// Gestion des signaux
process.on('SIGINT', () => {
    console.log('🔻 Arrêt du serveur...');
    saveLastClientNumber().catch(console.error);
    process.exit(0);
});

// Démarrer le serveur
startServer();
