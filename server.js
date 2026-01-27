const express = require('express');
const app = express();
const cors = require("cors");
const http = require('http').Server(app);
const PORT = process.env.PORT || 10000;
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');

// ====================================================================================
// CONFIGURATION DES CHEMINS - VERSION DÉFINITIVE
// ====================================================================================

console.log('🚀 [INIT] Démarrage du serveur CSR...');
console.log('==================================================');

// CHEMIN ABSOLU FIXE POUR RENDER.COM
const BASE_DATABASE_PATH = path.resolve('/opt/render/project/src/csr-backend-production/databases/databases');

console.log(`🎯 CHEMIN DE BASE DE DONNÉES: ${BASE_DATABASE_PATH}`);
console.log(`📂 Répertoire courant: ${process.cwd()}`);
console.log(`📂 __dirname: ${__dirname}`);

// Créer le dossier s'il n'existe pas
try {
    fsSync.mkdirSync(BASE_DATABASE_PATH, { recursive: true });
    console.log(`✅ Dossier base de données créé/vérifié`);
} catch (error) {
    console.error(`❌ Erreur création dossier: ${error.message}`);
}

// Définir tous les chemins de fichiers
const definePath = (filename) => {
    return path.join(BASE_DATABASE_PATH, filename);
};

// Fichiers journaux
const JOURNAL_LABO_FILE = definePath('journal_laboratoire.json');
const JOURNAL_CONSULT_FILE = definePath('journal_consultation.json');
const JOURNAL_CAISSE_FILE = definePath('journal_caisse.json');
const JOURNAL_CHIRURGIE_FILE = definePath('journal_chirurgie.json');
const JOURNAL_ECHOGRAPHIE_FILE = definePath('journal_echographie.json');
const JOURNAL_HOSPITALISATION_FILE = definePath('journal_hospitalisation.json');
const JOURNAL_KINESITHERAPIE_FILE = definePath('journal_kinesitherapie.json');
const JOURNAL_FIBROSCOPIE_FILE = definePath('journal_fibroscopie.json');

// Fichiers de données
const LABO_FILE = definePath('labo.json');
const USERS_FILE = definePath('users.json');
const ADMIN_LOG_FILE = definePath('admin_logs.json');
const LAST_CLIENT_NUMBER_FILE = definePath('last_client_number.json');

console.log('==================================================\n');

// ====================================================================================
// CONFIGURATION CORS POUR RENDER.COM
// ====================================================================================

const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://csr-system.vercel.app',
    'https://csr-frontend.onrender.com',
    'https://csr-frontend-production.onrender.com',
    'https://csr-backend-production.onrender.com'
];

const corsOptions = {
    origin: function (origin, callback) {
        // Autoriser les requêtes sans origine (comme Postman)
        if (!origin) {
            console.log('🌐 Requête sans origine (server-to-server)');
            return callback(null, true);
        }
        
        // Vérifier si l'origine est autorisée
        const isAllowed = allowedOrigins.some(allowedOrigin => {
            return origin === allowedOrigin || origin.includes(allowedOrigin.replace('https://', '').replace('http://', ''));
        });
        
        if (isAllowed) {
            console.log(`✅ CORS autorisé pour: ${origin}`);
            callback(null, true);
        } else {
            console.log(`🚫 CORS bloqué pour: ${origin}`);
            console.log(`📋 Liste des origines autorisées: ${JSON.stringify(allowedOrigins)}`);
            callback(new Error(`Origine non autorisée: ${origin}`));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Pour les requêtes preflight
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ====================================================================================
// CONFIGURATION SOCKET.IO
// ====================================================================================

const socketIO = require('socket.io')(http, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['polling', 'websocket']
});

// ====================================================================================
// VARIABLES GLOBALES
// ====================================================================================

let usersDatabase = [];
let dernierNumClient = 0;
let adminLogs = [];

// ====================================================================================
// FONCTIONS D'INITIALISATION - AMÉLIORÉES
// ====================================================================================

// Initialiser tous les fichiers journaux
const initializeAllJournals = async () => {
    console.log('\n📄 INITIALISATION DES JOURNAUX ET FICHIERS:');
    console.log('==================================================');
    
    const allFiles = [
        { file: JOURNAL_LABO_FILE, name: 'journal_laboratoire.json', default: '[]' },
        { file: JOURNAL_CONSULT_FILE, name: 'journal_consultation.json', default: '[]' },
        { file: JOURNAL_CAISSE_FILE, name: 'journal_caisse.json', default: '[]' },
        { file: JOURNAL_CHIRURGIE_FILE, name: 'journal_chirurgie.json', default: '[]' },
        { file: JOURNAL_ECHOGRAPHIE_FILE, name: 'journal_echographie.json', default: '[]' },
        { file: JOURNAL_HOSPITALISATION_FILE, name: 'journal_hospitalisation.json', default: '[]' },
        { file: JOURNAL_KINESITHERAPIE_FILE, name: 'journal_kinesitherapie.json', default: '[]' },
        { file: JOURNAL_FIBROSCOPIE_FILE, name: 'journal_fibroscopie.json', default: '[]' },
        { file: LABO_FILE, name: 'labo.json', default: '[]' },
        { file: USERS_FILE, name: 'users.json', default: '[]' },
        { file: ADMIN_LOG_FILE, name: 'admin_logs.json', default: '[]' },
        { file: LAST_CLIENT_NUMBER_FILE, name: 'last_client_number.json', default: '{"lastClientNumber": 0}' }
    ];
    
    for (const file of allFiles) {
        try {
            await fs.access(file.file);
            const content = await fs.readFile(file.file, 'utf8');
            console.log(`✅ ${file.name}: Existe (${content.length} octets)`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log(`📄 ${file.name}: Création...`);
                await fs.writeFile(file.file, file.default);
                console.log(`✅ ${file.name}: Créé`);
            } else {
                console.error(`❌ ${file.name}: ${error.message}`);
            }
        }
    }
    
    console.log('==================================================\n');
};

// ====================================================================================
// FONCTION D'AUTHENTIFICATION - VERSION AMÉLIORÉE
// ====================================================================================

const loadUsersDatabase = async () => {
    try {
        console.log('🔍 Chargement de la base utilisateurs...');
        
        // Vérifier si le fichier existe
        try {
            await fs.access(USERS_FILE);
        } catch {
            console.log('📁 Fichier users.json non trouvé, création...');
            await initializeUsers();
            return;
        }
        
        // Lire le fichier
        const content = await fs.readFile(USERS_FILE, 'utf8');
        
        if (!content.trim()) {
            console.log('⚠️  Fichier users.json vide, réinitialisation...');
            await initializeUsers();
            return;
        }
        
        // Parser le JSON
        usersDatabase = JSON.parse(content);
        console.log(`✅ Base utilisateurs chargée: ${usersDatabase.length} utilisateurs`);
        
        // Afficher les utilisateurs pour debug
        console.log('📋 UTILISATEURS DISPONIBLES:');
        usersDatabase.forEach(user => {
            console.log(`   • ${user.username} (${user.service}) - Mot de passe: "${user.password}"`);
        });
        
    } catch (error) {
        console.error(`❌ Erreur chargement utilisateurs: ${error.message}`);
        console.log('🔄 Réinitialisation des utilisateurs...');
        await initializeUsers();
    }
};

const initializeUsers = async () => {
    console.log('🔄 Initialisation des utilisateurs par défaut...');
    
    // Liste COMPLÈTE des utilisateurs avec tous les services
    const defaultUsers = [
        {
            id: 1,
            username: "admin",
            password: "12345678", // Mot de passe SIMPLE pour test
            service: "Administration",
            fullName: "Administrateur Principal",
            email: "admin@csr-tchad.com",
            isActive: true,
            createdAt: new Date().toISOString(),
            lastLogin: null,
            permissions: ["all"]
        },
        {
            id: 2,
            username: "Caisse",
            password: "12345678",
            service: "Caisse",
            fullName: "Caissier Principal",
            email: "caisse@csr-tchad.com",
            isActive: true,
            createdAt: new Date().toISOString(),
            lastLogin: null,
            permissions: ["caisse", "view", "create_patient", "print_receipt"]
        },
        {
            id: 3,
            username: "Labo",
            password: "12345678",
            service: "Laboratoire",
            fullName: "Technicien Laboratoire",
            email: "labo@csr-tchad.com",
            isActive: true,
            createdAt: new Date().toISOString(),
            lastLogin: null,
            permissions: ["labo", "view", "update_status", "print_results"]
        },
        {
            id: 4,
            username: "Consultation",
            password: "12345678",
            service: "Consultation",
            fullName: "Médecin Consultant",
            email: "consultation@csr-tchad.com",
            isActive: true,
            createdAt: new Date().toISOString(),
            lastLogin: null,
            permissions: ["consultation", "view", "diagnose", "prescribe"]
        },
        {
            id: 5,
            username: "Radiologie",
            password: "12345678",
            service: "Radiologie",
            fullName: "Technicien Radiologie",
            email: "radiologie@csr-tchad.com",
            isActive: true,
            createdAt: new Date().toISOString(),
            lastLogin: null,
            permissions: ["radiologie", "view", "upload_images"]
        },
        {
            id: 6,
            username: "Pharmacie",
            password: "12345678",
            service: "Pharmacie",
            fullName: "Pharmacien",
            email: "pharmacie@csr-tchad.com",
            isActive: true,
            createdAt: new Date().toISOString(),
            lastLogin: null,
            permissions: ["pharmacie", "view", "dispense", "inventory"]
        },
        {
            id: 7,
            username: "Chirurgie",
            password: "12345678",
            service: "Chirurgie",
            fullName: "Chirurgien",
            email: "chirurgie@csr-tchad.com",
            isActive: true,
            createdAt: new Date().toISOString(),
            lastLogin: null,
            permissions: ["chirurgie", "view", "schedule", "operate"]
        },
        {
            id: 8,
            username: "Echographie",
            password: "12345678",
            service: "Echographie",
            fullName: "Technicien Échographie",
            email: "echographie@csr-tchad.com",
            isActive: true,
            createdAt: new Date().toISOString(),
            lastLogin: null,
            permissions: ["echographie", "view", "perform", "report"]
        }
    ];
    
    try {
        // Sauvegarder dans le fichier
        await fs.writeFile(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
        usersDatabase = defaultUsers;
        
        console.log(`✅ ${defaultUsers.length} utilisateurs initialisés`);
        console.log('🔐 MOTS DE PASSE POUR TOUS LES UTILISATEURS: "12345678"');
        
        // Afficher la liste des utilisateurs
        console.log('\n📋 LISTE DES UTILISATEURS:');
        defaultUsers.forEach(user => {
            console.log(`   👤 ${user.username} - Service: ${user.service} - Actif: ${user.isActive ? '✅' : '❌'}`);
        });
        
    } catch (error) {
        console.error(`❌ Erreur initialisation utilisateurs: ${error.message}`);
        throw error;
    }
};

// ====================================================================================
// FONCTION DE VÉRIFICATION DES CREDENTIALS - VERSION ULTRA-DÉBOGUÉE
// ====================================================================================

const verifyCredentials = (username, password) => {
    console.log(`\n🔐 VÉRIFICATION CREDENTIALS:`);
    console.log(`   • Username reçu: "${username}"`);
    console.log(`   • Password reçu: "${password}"`);
    console.log(`   • Base utilisateurs: ${usersDatabase.length} utilisateurs`);
    
    // Afficher tous les utilisateurs disponibles pour debug
    console.log(`   📋 UTILISATEURS DANS LA BASE:`);
    usersDatabase.forEach((user, index) => {
        console.log(`     ${index + 1}. "${user.username}" (service: ${user.service}) - password: "${user.password}" - actif: ${user.isActive}`);
    });
    
    // Rechercher l'utilisateur
    const user = usersDatabase.find(u => {
        const usernameMatch = u.username.toLowerCase() === username.toLowerCase();
        const passwordMatch = u.password === password; // Comparaison exacte
        const isActive = u.isActive === true;
        
        console.log(`   🔍 Vérification "${u.username}":`);
        console.log(`       • usernameMatch: ${usernameMatch} ("${u.username}" === "${username}")`);
        console.log(`       • passwordMatch: ${passwordMatch} ("${u.password}" === "${password}")`);
        console.log(`       • isActive: ${isActive}`);
        
        return usernameMatch && passwordMatch && isActive;
    });
    
    if (user) {
        console.log(`   ✅ UTILISATEUR TROUVÉ: ${user.username} (${user.service})`);
        return {
            id: user.id,
            username: user.username,
            service: user.service,
            fullName: user.fullName || user.username,
            email: user.email || '',
            permissions: user.permissions || [],
            lastLogin: user.lastLogin,
            isActive: user.isActive
        };
    } else {
        console.log(`   ❌ AUCUN UTILISATEUR TROUVÉ`);
        console.log(`   🔍 RAISONS POSSIBLES:`);
        
        // Diagnostic détaillé
        const foundUserByName = usersDatabase.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (!foundUserByName) {
            console.log(`       • Utilisateur "${username}" n'existe pas dans la base`);
        } else {
            console.log(`       • Utilisateur "${username}" existe mais:`);
            console.log(`         - Mot de passe incorrect? "${foundUserByName.password}" attendu`);
            console.log(`         - Compte inactif? ${foundUserByName.isActive}`);
        }
        
        return null;
    }
};

// ====================================================================================
// FONCTION POUR ÉCRIRE DANS LES JOURNAUX
// ====================================================================================

const writeToJournal = async (journalType, entry) => {
    console.log(`\n📝 ÉCRITURE JOURNAL ${journalType.toUpperCase()}:`);
    
    // Mapper le type de journal au fichier
    const journalMap = {
        'laboratoire': JOURNAL_LABO_FILE,
        'consultation': JOURNAL_CONSULT_FILE,
        'caisse': JOURNAL_CAISSE_FILE,
        'chirurgie': JOURNAL_CHIRURGIE_FILE,
        'echographie': JOURNAL_ECHOGRAPHIE_FILE,
        'hospitalisation': JOURNAL_HOSPITALISATION_FILE,
        'kinesitherapie': JOURNAL_KINESITHERAPIE_FILE,
        'fibroscopie': JOURNAL_FIBROSCOPIE_FILE
    };
    
    const journalFile = journalMap[journalType];
    
    if (!journalFile) {
        throw new Error(`Type de journal non supporté: ${journalType}`);
    }
    
    console.log(`   📁 Fichier: ${journalFile}`);
    
    try {
        // Lire ou créer le fichier
        let data = [];
        try {
            const content = await fs.readFile(journalFile, 'utf8');
            data = content.trim() ? JSON.parse(content) : [];
        } catch {
            data = [];
        }
        
        // Ajouter l'entrée
        const journalEntry = {
            ...entry,
            id: `JRN_${Date.now()}`,
            journalType: journalType,
            timestamp: new Date().toISOString(),
            file: journalFile
        };
        
        data.unshift(journalEntry);
        
        // Limiter à 1000 entrées
        if (data.length > 1000) {
            data = data.slice(0, 1000);
        }
        
        // Écrire le fichier
        await fs.writeFile(journalFile, JSON.stringify(data, null, 2));
        
        console.log(`   ✅ Écriture réussie (${data.length} entrées)`);
        
        return journalEntry;
        
    } catch (error) {
        console.error(`   ❌ Erreur écriture: ${error.message}`);
        throw error;
    }
};

// ====================================================================================
// GESTIONNAIRES SOCKET.IO
// ====================================================================================

socketIO.on('connection', (socket) => {
    console.log(`\n✅ Connexion Socket.io: ${socket.id}`);
    
    // ============================================================================
    // GESTIONNAIRE D'AUTHENTIFICATION
    // ============================================================================
    
    socket.on('verify_user_credentials', async (credentials, callback) => {
        console.log(`\n🔐 DEMANDE D'AUTHENTIFICATION:`);
        console.log(`   • Socket: ${socket.id}`);
        console.log(`   • Username: ${credentials.username}`);
        
        try {
            if (!credentials.username || !credentials.password) {
                console.log(`   ❌ Données manquantes`);
                if (callback) {
                    callback({
                        success: true,
                        isValid: false,
                        message: 'Nom d\'utilisateur et mot de passe requis'
                    });
                }
                return;
            }
            
            // VÉRIFIER LES CREDENTIALS
            const user = verifyCredentials(credentials.username, credentials.password);
            
            if (user) {
                console.log(`   ✅ AUTHENTIFICATION RÉUSSIE pour ${user.username}`);
                
                // Mettre à jour la dernière connexion
                const userIndex = usersDatabase.findIndex(u => u.id === user.id);
                if (userIndex !== -1) {
                    usersDatabase[userIndex].lastLogin = new Date().toISOString();
                    await fs.writeFile(USERS_FILE, JSON.stringify(usersDatabase, null, 2));
                }
                
                // Réponse de succès
                if (callback) {
                    callback({
                        success: true,
                        isValid: true,
                        user: user,
                        message: `Authentification réussie - Bienvenue ${user.username}`
                    });
                }
                
                // Émettre un événement de connexion
                socket.emit('authentication_success', {
                    user: user,
                    timestamp: new Date().toISOString()
                });
                
            } else {
                console.log(`   ❌ AUTHENTIFICATION ÉCHOUÉE`);
                
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
            console.error(`   💥 ERREUR AUTHENTIFICATION: ${error.message}`);
            
            if (callback) {
                callback({
                    success: false,
                    message: `Erreur serveur: ${error.message}`
                });
            }
        }
    });
    
    // ============================================================================
    // GESTIONNAIRE POUR AJOUTER AU JOURNAL
    // ============================================================================
    
    socket.on('add_to_journal', async (data, callback) => {
        console.log(`\n📝 DEMANDE AJOUT JOURNAL: ${data.journalType}`);
        
        try {
            const result = await writeToJournal(data.journalType, data.entry);
            
            // Émettre la mise à jour
            socketIO.emit('journal_updated', {
                type: data.journalType,
                entry: result
            });
            
            if (callback) {
                callback({
                    success: true,
                    message: 'Journal mis à jour',
                    entry: result
                });
            }
            
        } catch (error) {
            console.error(`   ❌ Erreur: ${error.message}`);
            
            if (callback) {
                callback({
                    success: false,
                    message: error.message
                });
            }
        }
    });
    
    // ============================================================================
    // GESTIONNAIRE POUR ENREGISTRER UN PATIENT
    // ============================================================================
    
    socket.on('labo', async (patientData, callback) => {
        console.log(`\n👤 ENREGISTREMENT PATIENT: ${patientData.nomClient}`);
        
        try {
            // Sauvegarder dans labo.json
            let patients = [];
            try {
                const content = await fs.readFile(LABO_FILE, 'utf8');
                patients = content.trim() ? JSON.parse(content) : [];
            } catch {
                patients = [];
            }
            
            // Ajouter le patient
            patientData.dateCreation = new Date().toISOString();
            patients.push(patientData);
            
            await fs.writeFile(LABO_FILE, JSON.stringify(patients, null, 2));
            
            // Journaliser dans les services sélectionnés
            const services = patientData.servicesSelectionnes || [];
            
            for (const service of services) {
                const serviceName = typeof service === 'object' ? service.value : service;
                
                const journalEntry = {
                    ...patientData,
                    journalType: serviceName,
                    service: serviceName
                };
                
                await writeToJournal(serviceName, journalEntry);
                console.log(`   ✅ Journalisé dans ${serviceName}`);
            }
            
            // Réponse
            if (callback) {
                callback({
                    success: true,
                    message: 'Patient enregistré',
                    patient: patientData
                });
            }
            
        } catch (error) {
            console.error(`   ❌ Erreur: ${error.message}`);
            
            if (callback) {
                callback({
                    success: false,
                    message: error.message
                });
            }
        }
    });
    
    // ============================================================================
    // AUTRES GESTIONNAIRES
    // ============================================================================
    
    socket.on('get_last_client_number', async (callback) => {
        try {
            let lastNumber = 0;
            try {
                const content = await fs.readFile(LAST_CLIENT_NUMBER_FILE, 'utf8');
                const data = JSON.parse(content);
                lastNumber = data.lastClientNumber || 0;
            } catch {
                lastNumber = 0;
            }
            
            if (callback) {
                callback({
                    success: true,
                    lastClientNumber: lastNumber
                });
            }
        } catch (error) {
            if (callback) {
                callback({
                    success: false,
                    message: error.message
                });
            }
        }
    });
    
    socket.on('disconnect', () => {
        console.log(`🔌 Déconnexion: ${socket.id}`);
    });
});

// ====================================================================================
// ROUTES API
// ====================================================================================

// Route principale
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Serveur CSR Backend - TCHAD',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        databasePath: BASE_DATABASE_PATH,
        usersCount: usersDatabase.length
    });
});

// Route de santé
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

// Route pour tester l'authentification via API REST
app.post('/api/auth/test', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        console.log(`🔐 TEST AUTH API: ${username}`);
        
        const user = verifyCredentials(username, password);
        
        if (user) {
            res.json({
                success: true,
                authenticated: true,
                user: {
                    username: user.username,
                    service: user.service,
                    fullName: user.fullName
                },
                message: 'Authentification réussie'
            });
        } else {
            res.status(401).json({
                success: true,
                authenticated: false,
                message: 'Identifiants incorrects'
            });
        }
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
        console.log('🔄 Réinitialisation des utilisateurs demandée');
        
        await initializeUsers();
        
        res.json({
            success: true,
            message: 'Utilisateurs réinitialisés',
            users: usersDatabase.map(u => ({
                username: u.username,
                service: u.service,
                password: u.password
            }))
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Route pour voir les utilisateurs
app.get('/api/admin/users', async (req, res) => {
    try {
        res.json({
            success: true,
            users: usersDatabase.map(u => ({
                id: u.id,
                username: u.username,
                service: u.service,
                isActive: u.isActive,
                lastLogin: u.lastLogin
            })),
            total: usersDatabase.length,
            defaultPassword: '12345678'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Route pour voir l'état des journaux
app.get('/api/journals/status', async (req, res) => {
    try {
        const journals = [
            { name: 'Laboratoire', file: JOURNAL_LABO_FILE },
            { name: 'Consultation', file: JOURNAL_CONSULT_FILE },
            { name: 'Caisse', file: JOURNAL_CAISSE_FILE },
            { name: 'Chirurgie', file: JOURNAL_CHIRURGIE_FILE },
            { name: 'Échographie', file: JOURNAL_ECHOGRAPHIE_FILE },
            { name: 'Hospitalisation', file: JOURNAL_HOSPITALISATION_FILE },
            { name: 'Kinésithérapie', file: JOURNAL_KINESITHERAPIE_FILE },
            { name: 'Fibroscopie', file: JOURNAL_FIBROSCOPIE_FILE }
        ];
        
        const status = [];
        
        for (const journal of journals) {
            try {
                const content = await fs.readFile(journal.file, 'utf8');
                const data = content.trim() ? JSON.parse(content) : [];
                
                status.push({
                    name: journal.name,
                    file: path.basename(journal.file),
                    entries: data.length,
                    size: content.length,
                    lastEntry: data[0] ? new Date(data[0].timestamp).toLocaleString() : 'Aucune'
                });
            } catch (error) {
                status.push({
                    name: journal.name,
                    file: path.basename(journal.file),
                    error: error.message,
                    exists: false
                });
            }
        }
        
        res.json({
            success: true,
            basePath: BASE_DATABASE_PATH,
            journals: status,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Route pour tester l'écriture
app.post('/api/test/write', async (req, res) => {
    try {
        const { journalType, patientName } = req.body;
        const type = journalType || 'laboratoire';
        
        const testEntry = {
            test: true,
            patientName: patientName || 'Test Patient',
            patientId: 'TEST' + Date.now(),
            service: type,
            message: 'Test d\'écriture API',
            timestamp: new Date().toISOString()
        };
        
        const result = await writeToJournal(type, testEntry);
        
        res.json({
            success: true,
            message: `Test écriture dans ${type}`,
            entry: result,
            journalType: type
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ====================================================================================
// DÉMARRAGE DU SERVEUR
// ====================================================================================

async function startServer() {
    try {
        console.log('🚀 DÉMARRAGE DU SERVEUR CSR...');
        console.log('==================================================');
        
        // 1. Initialiser les fichiers
        await initializeAllJournals();
        
        // 2. Charger les utilisateurs (IMPORTANT!)
        await loadUsersDatabase();
        
        // 3. Démarrer le serveur
        http.listen(PORT, '0.0.0.0', () => {
            console.log('\n==================================================');
            console.log('🎉 SERVEUR DÉMARRÉ AVEC SUCCÈS!');
            console.log('==================================================');
            console.log(`📡 Port: ${PORT}`);
            console.log(`📁 Base de données: ${BASE_DATABASE_PATH}`);
            console.log(`👤 Utilisateurs: ${usersDatabase.length}`);
            console.log(`🔐 Mot de passe pour tous: 12345678`);
            console.log('\n📋 UTILISATEURS DISPONIBLES:');
            usersDatabase.forEach(user => {
                console.log(`   • ${user.username} (${user.service})`);
            });
            console.log('\n🔗 URLS IMPORTANTES:');
            console.log(`   • Serveur: https://csr-backend-production.onrender.com`);
            console.log(`   • Test auth: https://csr-backend-production.onrender.com/api/auth/test`);
            console.log(`   • Réinitialiser users: https://csr-backend-production.onrender.com/api/admin/reset-users`);
            console.log(`   • Voir journaux: https://csr-backend-production.onrender.com/api/journals/status`);
            console.log('==================================================\n');
        });
        
    } catch (error) {
        console.error('❌ ERREUR CRITIQUE AU DÉMARRAGE:');
        console.error(error.message);
        process.exit(1);
    }
}

// Démarrer le serveur
startServer();
