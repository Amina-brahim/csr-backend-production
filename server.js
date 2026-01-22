const express = require('express');
const app = express();
const cors = require("cors");
const http = require('http').Server(app);
const PORT = process.env.PORT || 4600;
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// ====================================================================================
// CORRECTION DES CHEMINS DES FICHIERS
// ====================================================================================

// Chemins des fichiers - STRUCTURE CORRIGÉE
const databasesDir = path.resolve(__dirname, 'databases', 'databases');
const LABO_FILE = path.resolve(databasesDir, 'labo.json');
const JOURNAL_LABO_FILE = path.resolve(databasesDir, 'journal_laboratoire.json');
const JOURNAL_CONSULT_FILE = path.resolve(databasesDir, 'journal_consultation.json');
const JOURNAL_CAISSE_FILE = path.resolve(databasesDir, 'journal_caisse.json');
const ADMIN_LOG_FILE = path.resolve(databasesDir, 'admin_logs.json');
const EXAMENS_CONFIG_FILE = path.resolve(databasesDir, 'examens_config.json');
const USERS_FILE = path.resolve(databasesDir, 'users.json');
const LAST_CLIENT_NUMBER_FILE = path.resolve(databasesDir, 'last_client_number.json');
const CLIENT_NUMBER_BACKUP_FILE = path.resolve(databasesDir, 'client_number_backup.json');
const PAYMENT_CANCELLATIONS_FILE = path.resolve(databasesDir, 'payment_cancellations.json');

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
            console.log(`📋 Liste des origines autorisées:`, allowedOrigins);
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

// Créer le répertoire si il n'existe pas
async function ensureDirectoryExists(dirPath) {
    try {
        await fs.access(dirPath);
        console.log('✅ Répertoire existe: ' + dirPath);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.mkdir(dirPath, { recursive: true });
            console.log('📁 Répertoire créé: ' + dirPath);
        } else {
            console.error('❌ Erreur vérification répertoire:', error);
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

let usersDatabase = []; // Initialisé vide, sera rempli par initializeUsersDatabase()

const initializeUsersDatabase = async () => {
    try {
        console.log('🔄 Initialisation de la base utilisateurs...');
        
        // Vérifier si le fichier existe
        const fileExists = await fs.access(USERS_FILE).then(() => true).catch(() => false);
        
        // FORCER la réinitialisation pour corriger le problème
        const FORCE_RESET = true;
        
        if (FORCE_RESET || !fileExists) {
            console.log('🔄 Réinitialisation des utilisateurs...');
            
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
            await ensureDirectoryExists(path.dirname(USERS_FILE));
            await fs.writeFile(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
            
            usersDatabase = defaultUsers;
            console.log(`✅ ${defaultUsers.length} utilisateurs réinitialisés`);
            
            // Afficher les identifiants
            console.log('📋 Identifiants disponibles (mot de passe: 12345678 pour tous):');
            defaultUsers.forEach(user => {
                console.log(`   • ${user.username} (${user.service})`);
            });
        } else {
            console.log('✅ Fichier utilisateurs existe déjà');
        }
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
        
        await ensureDirectoryExists(path.dirname(LAST_CLIENT_NUMBER_FILE));
        
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
        
        // Sauvegarder également une copie de backup
        await backupClientNumber();
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
            
            // Vérifier la cohérence avec la base patients
            try {
                const patients = await loadPatientData();
                if (patients.length > 0) {
                    const maxNumClient = Math.max(...patients.map(p => {
                        const num = parseInt(p.numClient);
                        return isNaN(num) ? 0 : num;
                    }));
                    
                    // Si la base contient un numéro plus grand, l'utiliser
                    if (maxNumClient > dernierNumClient) {
                        console.log(`🔄 Correction cohérence: ${dernierNumClient} → ${maxNumClient}`);
                        dernierNumClient = maxNumClient;
                    }
                }
            } catch (dbError) {
                console.error('Erreur vérification cohérence DB:', dbError);
            }
            
            console.log(`📊 Dernier numéro client: ${previousValue} → ${dernierNumClient}`);
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

// CORRECTION : Générer un nouvel ID client AVEC PERSISTANCE SYNCHRONISÉE
const generateNewClientId = async () => {
    let lockAcquired = false;
    try {
        // Acquérir un verrou pour éviter les conflits
        await acquireLock(LAST_CLIENT_NUMBER_FILE);
        lockAcquired = true;
        
        // Charger la valeur actuelle depuis le fichier
        await loadLastClientNumber();
        
        // Incrémenter
        dernierNumClient++;
        
        // Sauvegarder IMMÉDIATEMENT
        await saveLastClientNumber();
        
        console.log('✅ Nouveau numéro client généré et sauvegardé: ' + dernierNumClient);
        
        // Vérifier la cohérence avec la base de données
        try {
            const patients = await loadPatientData();
            if (patients.length > 0) {
                const maxNumClient = Math.max(...patients.map(p => {
                    const num = parseInt(p.numClient);
                    return isNaN(num) ? 0 : num;
                }));
                
                // Si un patient a un numéro supérieur, ajuster
                if (maxNumClient > dernierNumClient) {
                    console.warn(`⚠️ Correction: ${maxNumClient} > ${dernierNumClient}. Ajustement...`);
                    dernierNumClient = maxNumClient;
                    await saveLastClientNumber();
                }
            }
        } catch (error) {
            console.error('Erreur vérification cohérence:', error);
        }
        
        return dernierNumClient;
    } catch (error) {
        console.error('❌ Erreur génération ID:', error);
        
        // Tentative de récupération
        try {
            // Recharger depuis le fichier
            await loadLastClientNumber();
            dernierNumClient++; // Incrémenter quand même
            await saveLastClientNumber();
            return dernierNumClient;
        } catch (fallbackError) {
            console.error('❌ Erreur critique dans fallback:', fallbackError);
            // Utiliser timestamp comme fallback
            return Date.now() % 1000000;
        }
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
        
        // Charger tous les patients
        const patients = await loadPatientData();
        
        if (patients.length === 0) {
            console.log('📭 Aucun patient trouvé, numéro client à 0');
            dernierNumClient = 0;
            await saveLastClientNumber();
            return 0;
        }
        
        // Trouver le numéro maximum
        let maxNumClient = 0;
        patients.forEach(patient => {
            const num = parseInt(patient.numClient);
            if (!isNaN(num) && num > maxNumClient) {
                maxNumClient = num;
            }
        });
        
        // Mettre à jour
        const previousValue = dernierNumClient;
        dernierNumClient = maxNumClient;
        
        // Sauvegarder
        await saveLastClientNumber();
        
        console.log(`✅ Synchronisation: ${previousValue} → ${dernierNumClient} (${patients.length} patients)`);
        
        return dernierNumClient;
    } catch (error) {
        console.error('❌ Erreur synchronisation forcée:', error);
        throw error;
    }
};

// Fonction de backup
const backupClientNumber = async () => {
    try {
        await ensureDirectoryExists(path.dirname(CLIENT_NUMBER_BACKUP_FILE));
        
        const backup = {
            dernierNumClient: dernierNumClient,
            timestamp: new Date().toISOString(),
            patientsCount: (await loadPatientData()).length,
            serverUptime: process.uptime()
        };
        await fs.writeFile(CLIENT_NUMBER_BACKUP_FILE, JSON.stringify(backup, null, 2));
    } catch (error) {
        console.error('❌ Erreur backup:', error);
    }
};

// ====================================================================================
// FONCTIONS POUR LES JOURNAUX PAR SERVICE
// ====================================================================================

// Charger les données d'un journal spécifique
const loadJournalData = async (journalFile) => {
    try {
        await fs.access(journalFile);
        const data = await fs.readFile(journalFile, 'utf8');
        if (!data.trim()) return [];
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await ensureDirectoryExists(path.dirname(journalFile));
            await fs.writeFile(journalFile, '[]');
            return [];
        }
        throw error;
    }
};

// Ajouter une entrée à un journal spécifique
const addToJournal = async (journalFile, entry) => {
    try {
        await ensureDirectoryExists(path.dirname(journalFile));
        
        let journalData = await loadJournalData(journalFile);
        
        // Ajouter l'entrée avec timestamp
        const journalEntry = {
            ...entry,
            journalTimestamp: new Date().toISOString(),
            journalId: `JRN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };
        
        journalData.unshift(journalEntry); // Ajouter au début
        
        // Limiter la taille du journal
        if (journalData.length > 1000) {
            journalData = journalData.slice(0, 1000);
        }
        
        await fs.writeFile(journalFile, JSON.stringify(journalData, null, 2));
        
        console.log(`📝 Entrée ajoutée au journal ${path.basename(journalFile)}: ${entry.patientName || entry.nomClient || 'N/A'}`);
        
        return journalEntry;
    } catch (error) {
        console.error(`❌ Erreur ajout au journal ${path.basename(journalFile)}:`, error);
        throw error;
    }
};

// ====================================================================================
// FONCTIONS UTILITAIRES - CORRIGÉES POUR LES BONS CHEMINS
// ====================================================================================

// Fonction pour charger la configuration des examens
const loadExamensConfig = async () => {
    try {
        await ensureDirectoryExists(path.dirname(EXAMENS_CONFIG_FILE));
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
        await ensureDirectoryExists(path.dirname(EXAMENS_CONFIG_FILE));
        await fs.writeFile(EXAMENS_CONFIG_FILE, JSON.stringify(examensConfig, null, 2));
        console.log('✅ Configuration des examens sauvegardée');
    } catch (error) {
        console.error('❌ Erreur sauvegarde configuration examens:', error);
        throw error;
    }
};

// Charger les données des patients - CORRIGÉ POUR LE BON CHEMIN
const loadPatientData = async () => {
    try {
        await ensureDirectoryExists(path.dirname(LABO_FILE));
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

// Initialiser le fichier labo
async function initializeLaboFile() {
    try {
        await ensureDirectoryExists(path.dirname(LABO_FILE));
        
        try {
            await fs.access(LABO_FILE);
            console.log('✅ Fichier labo.json existe déjà');
            await chargerDernierNumClient();
        } catch (error) {
            if (error.code === 'ENOENT') {
                await fs.writeFile(LABO_FILE, '[]');
                console.log('📁 Fichier labo.json créé');
                await saveLastClientNumber(); // Initialiser le fichier de numéros
            } else {
                throw error;
            }
        }
    } catch (error) {
        console.error('❌ Erreur lors de l\'initialisation:', error);
    }
}

// Modifier la fonction chargerDernierNumClient
async function chargerDernierNumClient() {
    try {
        // D'abord charger depuis le fichier dédié
        await loadLastClientNumber();
        
        // Ensuite vérifier dans le fichier labo pour cohérence
        const patients = await loadPatientData();
        if (patients.length > 0) {
            const maxNumClient = Math.max(...patients.map(p => {
                const num = parseInt(p.numClient);
                return isNaN(num) ? 0 : num;
            }));
            
            // Si le max trouvé est supérieur à ce qu'on a, mettre à jour
            if (maxNumClient > dernierNumClient) {
                dernierNumClient = maxNumClient;
                await saveLastClientNumber();
                console.log('📊 Correction: dernier numéro client ajusté à: ' + dernierNumClient);
            }
        }
    } catch (error) {
        console.error('Erreur lors du chargement du dernier numéro client:', error);
        // Garder la valeur chargée ou 0
    }
}

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

// Charger les utilisateurs depuis le fichier - VERSION CORRIGÉE
const loadUsers = async () => {
    try {
        await ensureDirectoryExists(path.dirname(USERS_FILE));
        await fs.access(USERS_FILE);
        const data = await fs.readFile(USERS_FILE, 'utf8');
        if (data.trim()) {
            usersDatabase = JSON.parse(data);
            console.log('✅ Utilisateurs chargés: ' + usersDatabase.length);
            
            // Afficher les utilisateurs pour debug
            console.log('📋 Liste des utilisateurs:');
            usersDatabase.forEach(user => {
                console.log(`   • ${user.username} (${user.service}) - Mot de passe: ${user.password} - Actif: ${user.isActive}`);
            });
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('📁 Fichier utilisateurs non trouvé');
            // Le fichier sera créé par initializeUsersDatabase
        } else {
            console.error('❌ Erreur chargement utilisateurs:', error);
        }
    }
};

// Sauvegarder les utilisateurs
const saveUsers = async () => {
    try {
        await ensureDirectoryExists(path.dirname(USERS_FILE));
        await fs.writeFile(USERS_FILE, JSON.stringify(usersDatabase, null, 2));
        console.log('✅ Utilisateurs sauvegardés');
    } catch (error) {
        console.error('❌ Erreur sauvegarde utilisateurs:', error);
        throw error;
    }
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

// FONCTION VERIFY CREDENTIALS - VERSION AMÉLIORÉE POUR DEBUG
const verifyCredentials = (username, password) => {
    console.log('🔐 [SERVER] Vérification credentials pour:', username);
    console.log('🔐 [SERVER] Mot de passe reçu:', password);
    
    // Afficher tous les utilisateurs pour debug
    console.log('📋 [SERVER] Base utilisateurs actuelle:');
    usersDatabase.forEach(user => {
        console.log(`   • ${user.username}: "${user.password}" (service: ${user.service}, actif: ${user.isActive})`);
    });
    
    const user = usersDatabase.find(u => 
        u.username.toLowerCase() === username.toLowerCase() && 
        u.password === password && // Comparaison exacte
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
        console.log('❌ [SERVER] Raisons possibles:');
        
        const userExists = usersDatabase.some(u => u.username.toLowerCase() === username.toLowerCase());
        if (!userExists) {
            console.log('   - Utilisateur non trouvé dans la base');
        } else {
            const foundUser = usersDatabase.find(u => u.username.toLowerCase() === username.toLowerCase());
            if (foundUser && foundUser.password !== password) {
                console.log(`   - Mot de passe incorrect: reçu "${password}", attendu "${foundUser.password}"`);
            }
            if (foundUser && !foundUser.isActive) {
                console.log('   - Compte inactif');
            }
        }
        
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
        await ensureDirectoryExists(path.dirname(ADMIN_LOG_FILE));
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
        await ensureDirectoryExists(path.dirname(ADMIN_LOG_FILE));
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
// SOCKET.IO HANDLERS - COMPLET
// ====================================================================================

socketIO.on('connection', (socket) => {
    console.log('✅✅✅ NOUVELLE CONNEXION Socket.io: ' + socket.id);
    console.log('📡 IP: ' + socket.handshake.address);
    
    // Vérifier l'origine de la connexion
    const origin = socket.handshake.headers.origin || socket.handshake.headers.referer;
    if (origin && !allowedOrigins.some(allowed => origin.includes(allowed.replace('*', '')))) {
        console.log('🚫 Connexion Socket.IO rejetée - Origine non autorisée:', origin);
        socket.disconnect(true);
        return;
    }
    
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
    // GESTIONNAIRES SOCKET.IO
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

            socket.emit('identification_confirmed', {
                success: true,
                user: updatedUserData,
                message: `Identifié avec succès comme ${user.username} (${user.service})`
            });

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

    socket.on('sync_client_numbers', async (callback) => {
        try {
            console.log('🔄 [SERVER] Synchronisation des numéros client demandée');
            
            const newValue = await forceSyncClientNumbers();
            
            if (callback) {
                callback({
                    success: true,
                    lastClientNumber: newValue,
                    patientCount: (await loadPatientData()).length,
                    message: `Synchronisation terminée. Dernier numéro: ${newValue}`
                });
            }
        } catch (error) {
            console.error('❌ Erreur synchronisation:', error);
            if (callback) {
                callback({
                    success: false,
                    message: error.message
                });
            }
        }
    });

    socket.on('add_to_journal', async (data, callback) => {
        try {
            console.log('📝 Demande d\'ajout au journal:', data);
            
            const { journalType, entry } = data;
            
            if (!journalType || !entry) {
                throw new Error('Type de journal et entrée requis');
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
            
            const journalEntry = await addToJournal(journalFile, entry);
            
            socketIO.emit(`journal_updated_${journalType}`, journalEntry);
            socketIO.emit('journal_updated', { journalType, entry: journalEntry });
            
            if (callback) {
                callback({
                    success: true,
                    message: 'Entrée ajoutée au journal',
                    entry: journalEntry
                });
            }
        } catch (error) {
            console.error('❌ Erreur ajout au journal:', error);
            if (callback) {
                callback({
                    success: false,
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
            await ensureDirectoryExists(path.dirname(LABO_FILE));
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
                
                await addAdminLog(
                    'Patient mis à jour: ' + srData.nomClient + ' (CSR: ' + srData.numID_CSR + ')',
                    'patient_update',
                    'Caisse'
                );
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
                
                await addAdminLog(
                    'Nouveau patient: ' + srData.nomClient + ' (CSR: ' + srData.numID_CSR + ') - Numéro: ' + numClientFinal,
                    'patient_create',
                    'Caisse'
                );
                
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
                        
                        socketIO.emit(`nouveau_patient_${serviceName}`, journalEntry);
                        socketIO.emit('nouveau_patient_journal', journalEntry);
                        
                        console.log(`📋 [SERVER] Données envoyées au service ${serviceName}`);
                        
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

    socket.on('recuperer_donnees', async (callback) => {
        try {
            const donnees = await loadPatientData();
            if (callback) callback({ success: true, donnees });
        } catch (error) {
            console.error("Erreur récupération données:", error);
            if (callback) callback({ success: false, error: error.message });
        }
    });
    
    socket.on('recuperer_donnees_journal', async (callback) => {
        try {
            console.log('📥 [SERVER] Demande de récupération des données du journal');
            
            const patients = await loadPatientData();
            
            const donneesJournal = patients.map(patient => ({
                ...patient,
                dateCreation: patient.dateCreation || patient.dateModification || new Date().toISOString(),
                total_OP: patient.total_OP || 0,
                caisseUser: patient.caisseUser || 'Non spécifié',
                isLaboratorized: patient.isLaboratorized || 'En attente'
            }));

            console.log(`✅ [SERVER] ${donneesJournal.length} patients chargés pour le journal`);

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

    socket.on('get_next_client_id', async (callback) => {
        try {
            const nextId = await generateNewClientId();
            if (callback) callback({ success: true, nextId });
        } catch (error) {
            if (callback) callback({ success: false, message: error.message });
        }
    });
    
    socket.on('update_status', async ({ numClient, numID_CSR, isLaboratorized, patientName }) => {
        console.log('🔄 [SERVER] Mise à jour de statut reçue:');
        console.log('📋 CSR:', numID_CSR);
        console.log('📋 Client:', numClient);
        console.log('📋 Statut code:', isLaboratorized);
        console.log('📋 Nom patient:', patientName);
        
        try {
            const statusMap = {
                0: "En attente",
                1: "En cours",
                2: "Terminé",
                3: "Annulé"
            };
            const isLaboratorizedText = statusMap[isLaboratorized] || "En attente";
            
            console.log(`📊 Conversion statut: ${isLaboratorized} → "${isLaboratorizedText}"`);
            
            let updatedRecord;
            
            if (numID_CSR) {
                updatedRecord = await updateLaboratorizedStatusByCSR(numID_CSR, isLaboratorizedText);
                console.log(`✅ Statut mis à jour pour ${numID_CSR}: ${isLaboratorizedText}`);
            } else if (numClient) {
                updatedRecord = await updateLaboratorizedStatus(numClient, isLaboratorizedText);
                console.log(`✅ Statut mis à jour pour ${numClient}: ${isLaboratorizedText}`);
            } else {
                throw new Error('Identifiant client manquant (numClient ou numID_CSR requis)');
            }

            await addAdminLog(
                `Statut patient mis à jour: ${updatedRecord.nomClient} (${updatedRecord.numID_CSR}) - ${isLaboratorizedText}`,
                'status_update',
                'Laboratoire'
            );

            socket.emit('Mise à jour réussie', updatedRecord);
            socketIO.emit('Etat Analyses Mis à Jour', updatedRecord);
            socketIO.emit('journal_status_update', {
                patientId: updatedRecord.numID_CSR,
                patientName: updatedRecord.nomClient,
                patientNumber: updatedRecord.numClient,
                newStatus: isLaboratorizedText,
                updatedAt: new Date().toISOString(),
                updatedBy: 'Laboratoire'
            });

            socketIO.emit('patient_data_updated', updatedRecord);

            if (updatedRecord.servicesSelectionnes && Array.isArray(updatedRecord.servicesSelectionnes)) {
                updatedRecord.servicesSelectionnes.forEach(service => {
                    const serviceName = typeof service === 'object' ? service.value : service;
                    socketIO.emit(`patient_status_update_${serviceName}`, {
                        patientId: updatedRecord.numID_CSR,
                        newStatus: isLaboratorizedText,
                        service: serviceName
                    });
                });
            }

            console.log('📢 [SERVER] Diffusion de la mise à jour à tous les clients');
            console.log('👥 [SERVER] Nombre de clients connectés:', socketIO.engine.clientsCount);

        } catch (error) {
            console.error('❌ [SERVER] Erreur:', error.message);
            socket.emit('update_error', {
                numClient: numClient || numID_CSR,
                message: error.message
            });
        }
    });

    socket.on("maj", () => {
        socketIO.emit("update");
    });

    socket.on('ping', (data) => {
        socket.emit('pong', { 
            timestamp: Date.now(),
            serverTime: new Date().toISOString(),
            received: data 
        });
    });

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
        server: 'csr-backend-production.onrender.com',
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
        }
    });
});

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
        const safeUsers = usersDatabase.map(user => ({
            id: user.id,
            username: user.username,
            service: user.service,
            fullName: user.fullName,
            email: user.email,
            isActive: user.isActive,
            createdAt: user.createdAt,
            lastLogin: user.lastLogin,
            permissions: user.permissions
            // Ne pas inclure le mot de passe pour la sécurité
        }));
        
        res.json({
            success: true,
            users: safeUsers,
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

// Route pour réinitialiser les utilisateurs
app.post('/api/admin/reset-users', async (req, res) => {
    try {
        console.log('🔄 Demande de réinitialisation des utilisateurs');
        
        await initializeUsersDatabase();
        
        res.json({
            success: true,
            message: "Utilisateurs réinitialisés avec succès",
            users: usersDatabase.map(user => ({
                username: user.username,
                service: user.service,
                password: user.password
            }))
        });
    } catch (error) {
        console.error('❌ Erreur réinitialisation utilisateurs:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Route pour afficher les utilisateurs (avec mots de passe pour debug)
app.get('/api/admin/show-users', async (req, res) => {
    try {
        const usersInfo = usersDatabase.map(user => ({
            username: user.username,
            service: user.service,
            password: user.password,
            isActive: user.isActive,
            lastLogin: user.lastLogin
        }));
        
        res.json({
            success: true,
            users: usersInfo,
            count: usersDatabase.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
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
        
        const journalData = await loadJournalData(journalFile);
        const limitedData = journalData.slice(0, parseInt(limit));
        
        res.json({
            success: true,
            journalType,
            entries: limitedData,
            total: journalData.length,
            limit: parseInt(limit)
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
        socketIO.emit('journal_updated', { journalType, entry: journalEntry });
        
        res.json({
            success: true,
            message: 'Entrée ajoutée au journal',
            entry: journalEntry
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

// Route pour debug des numéros client
app.get('/api/debug/client-numbers', async (req, res) => {
    try {
        const patients = await loadPatientData();
        const maxNum = Math.max(...patients.map(p => parseInt(p.numClient) || 0));
        
        res.json({
            success: true,
            dernierNumClient: dernierNumClient,
            maxInDatabase: maxNum,
            patientCount: patients.length,
            isConsistent: maxNum === dernierNumClient,
            timestamp: new Date().toISOString(),
            patients: patients.slice(-5).map(p => ({ 
                numClient: p.numClient, 
                nomClient: p.nomClient,
                numID_CSR: p.numID_CSR 
            }))
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Route pour forcer la resynchronisation
app.post('/api/admin/resync-client-numbers', async (req, res) => {
    try {
        const newValue = await forceSyncClientNumbers();
        res.json({
            success: true,
            message: `Synchronisation forcée terminée`,
            newValue: newValue,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
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
            '/api/socket-status',
            '/api/auth/verify',
            '/api/users',
            '/api/admin/reset-users',
            '/api/admin/show-users',
            '/api/journals/:journalType',
            '/api/admin/logs',
            '/api/admin/stats',
            '/api/admin/connected-users',
            '/api/debug/client-numbers',
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
        console.log('📁 Structure des dossiers: csr-backend-production/databases/databases/');
        
        // Créer tous les répertoires nécessaires
        await ensureDirectoryExists(databasesDir);
        console.log('✅ Répertoire de base de données vérifié:', databasesDir);
        
        // 1. INITIALISER LES UTILISATEURS EN PREMIER
        await initializeUsersDatabase();
        console.log('✅ Base de données utilisateurs initialisée');
        
        // 2. Charger les utilisateurs
        await loadUsers();
        console.log('✅ Base de données utilisateurs chargée');
        
        // 3. Initialiser le fichier labo
        await initializeLaboFile();
        console.log('✅ Fichier labo initialisé');
        
        // 4. Synchronisation des numéros
        await forceSyncClientNumbers();
        console.log(`✅ Dernier numéro client synchronisé: ${dernierNumClient}`);
        
        // 5. Charger les autres configurations
        await loadAdminLogs();
        console.log('✅ Logs d\'administration chargés');
        
        await loadExamensConfig();
        console.log('✅ Configuration des examens chargée');
        
        // Vérifier la cohérence
        const patients = await loadPatientData();
        console.log(`📊 ${patients.length} patients trouvés dans la base`);
        
        // Initialiser les fichiers de journaux
        await loadJournalData(JOURNAL_LABO_FILE);
        await loadJournalData(JOURNAL_CONSULT_FILE);
        await loadJournalData(JOURNAL_CAISSE_FILE);
        console.log('✅ Fichiers de journaux initialisés');
        
        // Sauvegarde automatique périodique
        setInterval(async () => {
            try {
                await saveLastClientNumber();
                console.log('💾 Sauvegarde automatique du numéro client');
            } catch (error) {
                console.error('❌ Erreur sauvegarde automatique:', error);
            }
        }, 60000);

        // Synchronisation périodique
        setInterval(async () => {
            try {
                await forceSyncClientNumbers();
            } catch (error) {
                console.error('❌ Erreur synchro périodique:', error);
            }
        }, 300000);
        
        // Démarrer le serveur
        http.listen(PORT, '0.0.0.0', () => {
            console.log('==========================================');
            console.log('🎉 SERVEUR DÉMARRÉ AVEC SUCCÈS');
            console.log('==========================================');
            console.log('📁 Base de données: ' + databasesDir);
            console.log('📡 Port: ' + PORT);
            console.log('🔌 Socket.IO: ACTIVÉ ✅');
            console.log('📊 Utilisateurs: ' + usersDatabase.length);
            console.log('🔢 Dernier numéro client: ' + dernierNumClient);
            console.log('🔐 Identifiants disponibles:');
            console.log('   • Tous les utilisateurs ont le mot de passe: 12345678');
            console.log('   • Utilisateurs principaux: admin, Caisse, Labo, Consultation');
            console.log('📝 Journaux disponibles:');
            console.log('   • Laboratoire: ' + JOURNAL_LABO_FILE);
            console.log('   • Consultation: ' + JOURNAL_CONSULT_FILE);
            console.log('   • Caisse: ' + JOURNAL_CAISSE_FILE);
            console.log('==========================================');
            console.log('🛠️  URLs utiles:');
            console.log('   • Réinitialiser utilisateurs: https://csr-backend-production.onrender.com/api/admin/reset-users');
            console.log('   • Voir utilisateurs: https://csr-backend-production.onrender.com/api/admin/show-users');
            console.log('   • Health check: https://csr-backend-production.onrender.com/health');
            console.log('==========================================');
            
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
    addAdminLog('Serveur arrêté', 'server_stop', 'system');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('🔻 Arrêt du serveur (SIGTERM)...');
    saveLastClientNumber().catch(console.error);
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
