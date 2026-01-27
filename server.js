const express = require('express');
const app = express();
const cors = require("cors");
const http = require('http').Server(app);
const PORT = process.env.PORT || 10000;
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

// ====================================================================================
// CONFIGURATION DES CHEMINS
// ====================================================================================

const BASE_DATABASE_PATH = path.resolve('/opt/render/project/src/csr-backend-production/databases/databases');

console.log('🚀 DÉMARRAGE DU SERVEUR CSR...');
console.log(`📁 Chemin base de données: ${BASE_DATABASE_PATH}`);

// Créer le dossier
fsSync.mkdirSync(BASE_DATABASE_PATH, { recursive: true });

// Chemins des fichiers
const USERS_FILE = path.join(BASE_DATABASE_PATH, 'users.json');
const JOURNAL_LABO_FILE = path.join(BASE_DATABASE_PATH, 'journal_laboratoire.json');
const JOURNAL_CONSULT_FILE = path.join(BASE_DATABASE_PATH, 'journal_consultation.json');
const JOURNAL_CAISSE_FILE = path.join(BASE_DATABASE_PATH, 'journal_caisse.json');
const JOURNAL_CHIRURGIE_FILE = path.join(BASE_DATABASE_PATH, 'journal_chirurgie.json');
const JOURNAL_ECHOGRAPHIE_FILE = path.join(BASE_DATABASE_PATH, 'journal_echographie.json');
const JOURNAL_HOSPITALISATION_FILE = path.join(BASE_DATABASE_PATH, 'journal_hospitalisation.json');
const JOURNAL_KINESITHERAPIE_FILE = path.join(BASE_DATABASE_PATH, 'journal_kinesitherapie.json');
const JOURNAL_FIBROSCOPIE_FILE = path.join(BASE_DATABASE_PATH, 'journal_fibroscopie.json');
const LABO_FILE = path.join(BASE_DATABASE_PATH, 'labo.json');

// ====================================================================================
// FONCTION POUR FORCER L'INITIALISATION DES UTILISATEURS
// ====================================================================================

const FORCE_INITIALIZE_USERS = async () => {
    console.log('\n🔄 FORCE INITIALISATION DES UTILISATEURS...');
    
    const defaultUsers = [
        {
            id: 1,
            username: "admin",
            password: "12345678",
            service: "Administration",
            fullName: "Administrateur Principal",
            isActive: true,
            permissions: ["all"]
        },
        {
            id: 2,
            username: "Caisse",
            password: "12345678",
            service: "Caisse",
            fullName: "Caissier Principal",
            isActive: true,
            permissions: ["caisse", "view", "create_patient"]
        },
        {
            id: 3,
            username: "Labo",
            password: "12345678",
            service: "Laboratoire",
            fullName: "Technicien Laboratoire",
            isActive: true,
            permissions: ["labo", "view", "update_status"]
        },
        {
            id: 4,
            username: "Consultation",
            password: "12345678",
            service: "Consultation",
            fullName: "Médecin Consultant",
            isActive: true,
            permissions: ["consultation", "view"]
        },
        {
            id: 5,
            username: "Radiologie",
            password: "12345678",
            service: "Radiologie",
            fullName: "Technicien Radiologie",
            isActive: true,
            permissions: ["radiologie", "view"]
        },
        {
            id: 6,
            username: "Pharmacie",
            password: "12345678",
            service: "Pharmacie",
            fullName: "Pharmacien",
            isActive: true,
            permissions: ["pharmacie", "view"]
        },
        {
            id: 7,
            username: "Chirurgie",
            password: "12345678",
            service: "Chirurgie",
            fullName: "Chirurgien",
            isActive: true,
            permissions: ["chirurgie", "view"]
        },
        {
            id: 8,
            username: "Echographie",
            password: "12345678",
            service: "Echographie",
            fullName: "Technicien Échographie",
            isActive: true,
            permissions: ["echographie", "view"]
        }
    ];
    
    try {
        // Écrire dans le fichier
        await fs.writeFile(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
        
        console.log(`✅ ${defaultUsers.length} utilisateurs créés dans ${USERS_FILE}`);
        console.log('🔐 MOTS DE PASSE: "12345678" pour tous les utilisateurs');
        
        // Afficher la liste
        console.log('\n📋 LISTE DES UTILISATEURS:');
        defaultUsers.forEach(user => {
            console.log(`   👤 ${user.username} (${user.service})`);
        });
        
        return defaultUsers;
        
    } catch (error) {
        console.error(`❌ Erreur création utilisateurs: ${error.message}`);
        throw error;
    }
};

// ====================================================================================
// CHARGEMENT DES UTILISATEURS - VERSION CORRIGÉE
// ====================================================================================

let usersDatabase = [];

const loadUsersDatabase = async () => {
    try {
        console.log('\n🔍 CHARGEMENT DES UTILISATEURS...');
        
        // Vérifier si le fichier existe
        try {
            await fs.access(USERS_FILE);
            console.log(`✅ Fichier users.json existe`);
        } catch {
            console.log(`📁 Fichier users.json non trouvé, création...`);
            usersDatabase = await FORCE_INITIALIZE_USERS();
            return usersDatabase;
        }
        
        // Lire le fichier
        const content = await fs.readFile(USERS_FILE, 'utf8');
        console.log(`📄 Taille du fichier: ${content.length} caractères`);
        
        if (!content.trim()) {
            console.log('⚠️  Fichier users.json VIDE, réinitialisation...');
            usersDatabase = await FORCE_INITIALIZE_USERS();
            return usersDatabase;
        }
        
        // Parser le JSON
        usersDatabase = JSON.parse(content);
        
        if (!Array.isArray(usersDatabase) || usersDatabase.length === 0) {
            console.log('⚠️  Tableau utilisateurs vide, réinitialisation...');
            usersDatabase = await FORCE_INITIALIZE_USERS();
        } else {
            console.log(`✅ ${usersDatabase.length} utilisateurs chargés`);
        }
        
        return usersDatabase;
        
    } catch (error) {
        console.error(`❌ Erreur chargement utilisateurs: ${error.message}`);
        console.log('🔄 Tentative de réinitialisation...');
        usersDatabase = await FORCE_INITIALIZE_USERS();
        return usersDatabase;
    }
};

// ====================================================================================
// FONCTION D'AUTHENTIFICATION SIMPLIFIÉE
// ====================================================================================

const verifyCredentials = (username, password) => {
    console.log(`\n🔐 VÉRIFICATION: ${username}`);
    
    if (!usersDatabase || usersDatabase.length === 0) {
        console.log('❌ Base utilisateurs vide!');
        return null;
    }
    
    const user = usersDatabase.find(u => 
        u.username === username && 
        u.password === password &&
        u.isActive === true
    );
    
    if (user) {
        console.log(`✅ Utilisateur trouvé: ${user.username} (${user.service})`);
        return {
            id: user.id,
            username: user.username,
            service: user.service,
            fullName: user.fullName || user.username,
            permissions: user.permissions || []
        };
    }
    
    console.log(`❌ Utilisateur non trouvé ou mot de passe incorrect`);
    return null;
};

// ====================================================================================
// CONFIGURATION CORS
// ====================================================================================

app.use(cors({
    origin: ['https://csr-system.vercel.app', 'https://csr-frontend.onrender.com'],
    credentials: true
}));

app.use(express.json());

// ====================================================================================
// CONFIGURATION SOCKET.IO
// ====================================================================================

const socketIO = require('socket.io')(http, {
    cors: {
        origin: ['https://csr-system.vercel.app', 'https://csr-frontend.onrender.com'],
        credentials: true
    }
});

// ====================================================================================
// GESTIONNAIRES SOCKET.IO
// ====================================================================================

socketIO.on('connection', (socket) => {
    console.log(`✅ Connexion: ${socket.id}`);
    
    // AUTHENTIFICATION
    socket.on('verify_user_credentials', async (credentials, callback) => {
        console.log(`\n🔐 AUTH REÇUE: ${credentials.username}`);
        
        try {
            const user = verifyCredentials(credentials.username, credentials.password);
            
            if (user) {
                if (callback) {
                    callback({
                        success: true,
                        isValid: true,
                        user: user,
                        message: 'Authentification réussie'
                    });
                }
            } else {
                if (callback) {
                    callback({
                        success: true,
                        isValid: false,
                        user: null,
                        message: 'Identifiants incorrects'
                    });
                }
            }
        } catch (error) {
            console.error(`💥 Erreur auth: ${error.message}`);
            if (callback) {
                callback({
                    success: false,
                    message: 'Erreur serveur'
                });
            }
        }
    });
    
    // AJOUT AU JOURNAL
    socket.on('add_to_journal', async (data, callback) => {
        console.log(`\n📝 AJOUT JOURNAL: ${data.journalType}`);
        
        try {
            // Déterminer le fichier
            let journalFile;
            switch(data.journalType) {
                case 'laboratoire': journalFile = JOURNAL_LABO_FILE; break;
                case 'consultation': journalFile = JOURNAL_CONSULT_FILE; break;
                case 'caisse': journalFile = JOURNAL_CAISSE_FILE; break;
                case 'chirurgie': journalFile = JOURNAL_CHIRURGIE_FILE; break;
                case 'echographie': journalFile = JOURNAL_ECHOGRAPHIE_FILE; break;
                case 'hospitalisation': journalFile = JOURNAL_HOSPITALISATION_FILE; break;
                case 'kinesitherapie': journalFile = JOURNAL_KINESITHERAPIE_FILE; break;
                case 'fibroscopie': journalFile = JOURNAL_FIBROSCOPIE_FILE; break;
                default: throw new Error('Type de journal inconnu');
            }
            
            // Lire ou créer le fichier
            let entries = [];
            try {
                const content = await fs.readFile(journalFile, 'utf8');
                entries = content.trim() ? JSON.parse(content) : [];
            } catch {
                entries = [];
            }
            
            // Ajouter l'entrée
            const entry = {
                ...data.entry,
                id: `JRN_${Date.now()}`,
                timestamp: new Date().toISOString(),
                journalType: data.journalType
            };
            
            entries.unshift(entry);
            
            // Sauvegarder
            await fs.writeFile(journalFile, JSON.stringify(entries, null, 2));
            
            console.log(`✅ Écrit dans ${path.basename(journalFile)} (${entries.length} entrées)`);
            
            if (callback) {
                callback({
                    success: true,
                    message: 'Journal mis à jour'
                });
            }
            
        } catch (error) {
            console.error(`❌ Erreur journal: ${error.message}`);
            if (callback) {
                callback({
                    success: false,
                    message: error.message
                });
            }
        }
    });
    
    // ENREGISTREMENT PATIENT
    socket.on('labo', async (patientData, callback) => {
        console.log(`\n👤 PATIENT: ${patientData.nomClient}`);
        
        try {
            // Sauvegarder dans labo.json
            let patients = [];
            try {
                const content = await fs.readFile(LABO_FILE, 'utf8');
                patients = content.trim() ? JSON.parse(content) : [];
            } catch {
                patients = [];
            }
            
            patients.push({
                ...patientData,
                dateCreation: new Date().toISOString()
            });
            
            await fs.writeFile(LABO_FILE, JSON.stringify(patients, null, 2));
            
            // Journaliser les services
            const services = patientData.servicesSelectionnes || [];
            for (const service of services) {
                const serviceName = typeof service === 'object' ? service.value : service;
                
                socket.emit('add_to_journal', {
                    journalType: serviceName,
                    entry: {
                        ...patientData,
                        service: serviceName,
                        patientName: patientData.nomClient,
                        patientId: patientData.numID_CSR
                    }
                });
            }
            
            if (callback) {
                callback({
                    success: true,
                    message: 'Patient enregistré'
                });
            }
            
        } catch (error) {
            console.error(`❌ Erreur patient: ${error.message}`);
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

app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Serveur CSR - Authentification réparée',
        timestamp: new Date().toISOString(),
        usersCount: usersDatabase.length
    });
});

// ROUTE URGENTE : RÉINITIALISER LES UTILISATEURS
app.post('/api/emergency/reset-users', async (req, res) => {
    try {
        console.log('🚨 RÉINITIALISATION URGENTE DES UTILISATEURS');
        
        usersDatabase = await FORCE_INITIALIZE_USERS();
        
        res.json({
            success: true,
            message: 'Utilisateurs réinitialisés URGENCE',
            users: usersDatabase.map(u => ({
                username: u.username,
                service: u.service,
                password: u.password
            })),
            total: usersDatabase.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// TEST AUTH
app.post('/api/test-auth', async (req, res) => {
    const { username, password } = req.body;
    
    console.log(`🔐 TEST API: ${username}`);
    
    const user = verifyCredentials(username, password);
    
    if (user) {
        res.json({
            success: true,
            authenticated: true,
            user: user,
            message: 'Authentification réussie via API'
        });
    } else {
        res.status(401).json({
            success: true,
            authenticated: false,
            message: 'Échec authentification',
            usersAvailable: usersDatabase.map(u => u.username)
        });
    }
});

// ÉTAT DES UTILISATEURS
app.get('/api/users-status', (req, res) => {
    res.json({
        success: true,
        usersCount: usersDatabase.length,
        users: usersDatabase.map(u => ({
            username: u.username,
            service: u.service,
            isActive: u.isActive
        })),
        filePath: USERS_FILE,
        fileExists: fsSync.existsSync(USERS_FILE)
    });
});

// TEST ÉCRITURE JOURNAL
app.post('/api/test-journal', async (req, res) => {
    try {
        const { journalType } = req.body;
        const type = journalType || 'laboratoire';
        
        let journalFile;
        switch(type) {
            case 'laboratoire': journalFile = JOURNAL_LABO_FILE; break;
            case 'consultation': journalFile = JOURNAL_CONSULT_FILE; break;
            case 'caisse': journalFile = JOURNAL_CAISSE_FILE; break;
            default: journalFile = JOURNAL_LABO_FILE;
        }
        
        // Lire le fichier
        let entries = [];
        try {
            const content = await fs.readFile(journalFile, 'utf8');
            entries = content.trim() ? JSON.parse(content) : [];
        } catch {
            entries = [];
        }
        
        // Ajouter une entrée test
        const testEntry = {
            test: true,
            message: 'Test API',
            timestamp: new Date().toISOString(),
            journalType: type
        };
        
        entries.unshift(testEntry);
        
        // Sauvegarder
        await fs.writeFile(journalFile, JSON.stringify(entries, null, 2));
        
        res.json({
            success: true,
            message: `Test écriture dans ${type}`,
            journalFile: path.basename(journalFile),
            entriesCount: entries.length,
            filePath: journalFile
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
        console.log('🚀 DÉMARRAGE DU SERVEUR...');
        
        // 1. CHARGER LES UTILISATEURS (IMPORTANT!)
        await loadUsersDatabase();
        
        // 2. DÉMARRER LE SERVEUR
        http.listen(PORT, '0.0.0.0', () => {
            console.log('\n==================================================');
            console.log('🎉 SERVEUR DÉMARRÉ!');
            console.log('==================================================');
            console.log(`📡 Port: ${PORT}`);
            console.log(`👤 Utilisateurs: ${usersDatabase.length}`);
            console.log(`🔐 Mot de passe: 12345678`);
            
            if (usersDatabase.length > 0) {
                console.log('\n📋 UTILISATEURS ACTIFS:');
                usersDatabase.forEach(user => {
                    console.log(`   • ${user.username} (${user.service})`);
                });
            } else {
                console.log('\n⚠️  AUCUN UTILISATEUR!');
                console.log(`   Utilisez cette URL pour créer les utilisateurs:`);
                console.log(`   https://csr-backend-production.onrender.com/api/emergency/reset-users`);
            }
            
            console.log('\n🔗 URLS IMPORTANTES:');
            console.log(`   • Réinitialiser utilisateurs (URGENT):`);
            console.log(`     https://csr-backend-production.onrender.com/api/emergency/reset-users`);
            console.log(`   • Tester authentification:`);
            console.log(`     https://csr-backend-production.onrender.com/api/test-auth`);
            console.log(`   • Voir état utilisateurs:`);
            console.log(`     https://csr-backend-production.onrender.com/api/users-status`);
            console.log('==================================================\n');
        });
        
    } catch (error) {
        console.error('❌ ERREUR DÉMARRAGE:', error.message);
        process.exit(1);
    }
}

startServer();
