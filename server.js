const express = require('express');
const app = express();
const cors = require("cors");
const http = require('http').Server(app);
const PORT = process.env.PORT || 4600;
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');

// ====================================================================================
// CORRECTION DÉFINITIVE DES CHEMINS - FORCER LE BON DOSSIER
// ====================================================================================

console.log('🚀 [INIT] Démarrage du serveur CSR...');
console.log('==================================================');

// 1. DÉTERMINER LE CHEMIN ABSOLU CORRECT
let BASE_DATABASE_PATH;

// Essayer différentes approches pour trouver le bon chemin
const possiblePaths = [
    // Chemin spécifique que vous voulez
    'csr-backend-production/databases/databases',
    // Relatif depuis le répertoire courant
    './csr-backend-production/databases/databases',
    // Absolu depuis la racine
    '/csr-backend-production/databases/databases',
    // Chemin Render.com standard
    '/opt/render/project/src/csr-backend-production/databases/databases',
    // Chemin Render.com alternatif
    '/var/app/current/csr-backend-production/databases/databases'
];

// Tester quel chemin fonctionne
for (const testPath of possiblePaths) {
    const resolvedPath = path.resolve(testPath);
    console.log(`🔍 Test chemin: ${resolvedPath}`);
    
    try {
        // Essayer d'accéder au dossier ou de le créer
        try {
            fsSync.accessSync(path.dirname(resolvedPath));
            console.log(`   ✅ Dossier parent existe`);
        } catch {
            console.log(`   📁 Création dossier parent...`);
            fsSync.mkdirSync(path.dirname(resolvedPath), { recursive: true });
        }
        
        // Marquer ce chemin comme utilisable
        BASE_DATABASE_PATH = resolvedPath;
        console.log(`🎯 CHEMIN SÉLECTIONNÉ: ${BASE_DATABASE_PATH}`);
        break;
    } catch (error) {
        console.log(`   ❌ Non accessible: ${error.message}`);
    }
}

// Si aucun chemin ne fonctionne, créer un chemin absolu basé sur le répertoire courant
if (!BASE_DATABASE_PATH) {
    BASE_DATABASE_PATH = path.resolve(process.cwd(), 'csr-backend-production', 'databases', 'databases');
    console.log(`⚠️  Utilisation chemin par défaut: ${BASE_DATABASE_PATH}`);
}

// 2. CRÉER LE DOSSIER S'IL N'EXISTE PAS
try {
    fsSync.mkdirSync(BASE_DATABASE_PATH, { recursive: true });
    console.log(`✅ Dossier créé/vérifié: ${BASE_DATABASE_PATH}`);
} catch (error) {
    console.error(`❌ Impossible de créer le dossier: ${error.message}`);
}

// 3. DÉFINIR TOUS LES CHEMINS DE FICHIERS
const defineJournalPath = (filename) => {
    const fullPath = path.join(BASE_DATABASE_PATH, filename);
    console.log(`📄 ${filename}: ${fullPath}`);
    return fullPath;
};

// Tous les fichiers journaux
const JOURNAL_LABO_FILE = defineJournalPath('journal_laboratoire.json');
const JOURNAL_CONSULT_FILE = defineJournalPath('journal_consultation.json');
const JOURNAL_CAISSE_FILE = defineJournalPath('journal_caisse.json');
const JOURNAL_CHIRURGIE_FILE = defineJournalPath('journal_chirurgie.json');
const JOURNAL_ECHOGRAPHIE_FILE = defineJournalPath('journal_echographie.json');
const JOURNAL_HOSPITALISATION_FILE = defineJournalPath('journal_hospitalisation.json');
const JOURNAL_KINESITHERAPIE_FILE = defineJournalPath('journal_kinesitherapie.json');
const JOURNAL_FIBROSCOPIE_FILE = defineJournalPath('journal_fibroscopie.json');

// Autres fichiers
const LABO_FILE = defineJournalPath('labo.json');
const USERS_FILE = defineJournalPath('users.json');
const ADMIN_LOG_FILE = defineJournalPath('admin_logs.json');
const EXAMENS_CONFIG_FILE = defineJournalPath('examens_config.json');
const LAST_CLIENT_NUMBER_FILE = defineJournalPath('last_client_number.json');

console.log('==================================================\n');

// ====================================================================================
// FONCTION ULTRA-FIABLE POUR ÉCRIRE DANS LES JOURNAUX
// ====================================================================================

const writeToJournal = async (journalType, entry) => {
    console.log(`\n📝 [JOURNAL ${journalType.toUpperCase()}] Début écriture...`);
    
    // Mapper le type de journal au fichier correspondant
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
        console.error(`❌ Type de journal inconnu: ${journalType}`);
        throw new Error(`Type de journal non supporté: ${journalType}`);
    }
    
    console.log(`📁 Fichier cible: ${journalFile}`);
    console.log(`📍 Chemin absolu: ${path.resolve(journalFile)}`);
    
    try {
        // 1. S'assurer que le dossier existe
        const dirPath = path.dirname(journalFile);
        try {
            fsSync.accessSync(dirPath);
        } catch {
            console.log(`📂 Création dossier: ${dirPath}`);
            fsSync.mkdirSync(dirPath, { recursive: true });
        }
        
        // 2. Préparer l'entrée
        const journalEntry = {
            ...entry,
            id: `JRN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            journalType: journalType,
            timestamp: new Date().toISOString(),
            dateAdded: new Date().toLocaleString('fr-FR'),
            fileWritten: journalFile
        };
        
        console.log(`📋 Données à sauvegarder:`);
        console.log(`   • Patient: ${journalEntry.patientName || journalEntry.nomClient || 'N/A'}`);
        console.log(`   • Service: ${journalType}`);
        console.log(`   • ID: ${journalEntry.id}`);
        
        // 3. Lire les données existantes ou initialiser
        let existingData = [];
        try {
            const fileContent = await fs.readFile(journalFile, 'utf8');
            if (fileContent.trim()) {
                existingData = JSON.parse(fileContent);
                console.log(`📊 ${existingData.length} entrées existantes`);
            }
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log(`📄 Création nouveau fichier: ${path.basename(journalFile)}`);
            } else {
                console.error(`⚠️  Erreur lecture: ${error.message}`);
            }
        }
        
        // 4. Ajouter la nouvelle entrée
        existingData.unshift(journalEntry);
        
        // 5. Limiter la taille (garder les 1000 dernières entrées)
        if (existingData.length > 1000) {
            existingData = existingData.slice(0, 1000);
        }
        
        // 6. ÉCRIRE DANS LE FICHIER (méthode ultra-fiable)
        const tempFile = journalFile + '.tmp';
        
        // Écrire d'abord dans un fichier temporaire
        await fs.writeFile(tempFile, JSON.stringify(existingData, null, 2));
        
        // Remplacer l'ancien fichier
        await fs.rename(tempFile, journalFile);
        
        console.log(`✅✅✅ ÉCRITURE RÉUSSIE DANS ${path.basename(journalFile)}`);
        console.log(`   • Chemin: ${journalFile}`);
        console.log(`   • Nouvelles entrées: ${existingData.length}`);
        console.log(`   • Taille fichier: ${JSON.stringify(existingData).length} octets`);
        
        // 7. VÉRIFICATION (optionnel mais recommandé)
        try {
            const verifyContent = await fs.readFile(journalFile, 'utf8');
            const verifyData = JSON.parse(verifyContent);
            console.log(`🔍 Vérification: ${verifyData.length} entrées confirmées`);
            
            // Vérifier que notre entrée est bien là
            const found = verifyData.find(e => e.id === journalEntry.id);
            if (found) {
                console.log(`✅ Notre entrée est bien dans le fichier!`);
            } else {
                console.warn(`⚠️  Notre entrée n'a pas été trouvée dans la vérification`);
            }
        } catch (verifyError) {
            console.error(`❌ Erreur vérification: ${verifyError.message}`);
        }
        
        return journalEntry;
        
    } catch (error) {
        console.error(`❌❌❌ ERREUR CRITIQUE D'ÉCRITURE:`);
        console.error(`   • Fichier: ${journalFile}`);
        console.error(`   • Type: ${journalType}`);
        console.error(`   • Erreur: ${error.message}`);
        
        // Sauvegarder l'erreur pour debug
        try {
            const errorLog = {
                timestamp: new Date().toISOString(),
                journalType: journalType,
                journalFile: journalFile,
                error: error.message,
                stack: error.stack,
                entry: entry,
                cwd: process.cwd(),
                basePath: BASE_DATABASE_PATH
            };
            
            const errorFile = path.join(BASE_DATABASE_PATH, 'journal_write_errors.json');
            let errors = [];
            
            try {
                const errorContent = await fs.readFile(errorFile, 'utf8');
                errors = errorContent.trim() ? JSON.parse(errorContent) : [];
            } catch {}
            
            errors.unshift(errorLog);
            await fs.writeFile(errorFile, JSON.stringify(errors.slice(0, 50), null, 2));
            
            console.log(`📄 Erreur enregistrée dans: ${errorFile}`);
        } catch (logError) {
            console.error(`❌ Impossible d'enregistrer l'erreur: ${logError.message}`);
        }
        
        throw error;
    }
};

// ====================================================================================
// CONFIGURATION CORS
// ====================================================================================

const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://csr-system.vercel.app',
    'https://csr-frontend.onrender.com'
];

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Origine non autorisée'));
        }
    },
    credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// ====================================================================================
// CONFIGURATION SOCKET.IO
// ====================================================================================

const socketIO = require('socket.io')(http, {
    cors: {
        origin: allowedOrigins,
        credentials: true
    }
});

// ====================================================================================
// INITIALISATION DES DONNÉES
// ====================================================================================

let usersDatabase = [];
let dernierNumClient = 0;
let adminLogs = [];

// ====================================================================================
// FONCTIONS D'INITIALISATION
// ====================================================================================

// Initialiser tous les fichiers journaux
const initializeAllJournals = async () => {
    console.log('\n📄 INITIALISATION DE TOUS LES JOURNAUX:');
    console.log('==================================================');
    
    const allJournals = [
        { file: JOURNAL_LABO_FILE, name: 'journal_laboratoire.json' },
        { file: JOURNAL_CONSULT_FILE, name: 'journal_consultation.json' },
        { file: JOURNAL_CAISSE_FILE, name: 'journal_caisse.json' },
        { file: JOURNAL_CHIRURGIE_FILE, name: 'journal_chirurgie.json' },
        { file: JOURNAL_ECHOGRAPHIE_FILE, name: 'journal_echographie.json' },
        { file: JOURNAL_HOSPITALISATION_FILE, name: 'journal_hospitalisation.json' },
        { file: JOURNAL_KINESITHERAPIE_FILE, name: 'journal_kinesitherapie.json' },
        { file: JOURNAL_FIBROSCOPIE_FILE, name: 'journal_fibroscopie.json' },
        { file: LABO_FILE, name: 'labo.json' },
        { file: USERS_FILE, name: 'users.json' }
    ];
    
    for (const journal of allJournals) {
        try {
            await fs.access(journal.file);
            const content = await fs.readFile(journal.file, 'utf8');
            const data = content.trim() ? JSON.parse(content) : [];
            console.log(`✅ ${journal.name}: ${data.length} entrées`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log(`📄 ${journal.name}: Création...`);
                await fs.writeFile(journal.file, '[]');
                console.log(`✅ ${journal.name}: Créé`);
            } else {
                console.error(`❌ ${journal.name}: ${error.message}`);
            }
        }
    }
    
    console.log('==================================================\n');
};

// Initialiser les utilisateurs
const initializeUsers = async () => {
    const defaultUsers = [
        { id: 1, username: "admin", password: "12345678", service: "Administration" },
        { id: 2, username: "Caisse", password: "12345678", service: "Caisse" },
        { id: 3, username: "Labo", password: "12345678", service: "Laboratoire" },
        { id: 4, username: "Consultation", password: "12345678", service: "Consultation" }
    ];
    
    await fs.writeFile(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
    usersDatabase = defaultUsers;
    console.log(`✅ ${defaultUsers.length} utilisateurs initialisés`);
};

// ====================================================================================
// GESTIONNAIRES SOCKET.IO
// ====================================================================================

socketIO.on('connection', (socket) => {
    console.log(`✅ Connexion Socket.io: ${socket.id}`);
    
    // ============================================================================
    // GESTIONNAIRE ADD_TO_JOURNAL ULTRA-FIABLE
    // ============================================================================
    
    socket.on('add_to_journal', async (data, callback) => {
        console.log(`\n📡 [SOCKET] Événement add_to_journal reçu`);
        console.log(`📡 Type: ${data.journalType}`);
        console.log(`📡 Socket: ${socket.id}`);
        
        try {
            const { journalType, entry } = data;
            
            if (!journalType || !entry) {
                throw new Error('Données manquantes');
            }
            
            console.log(`📋 Données patient:`);
            console.log(`   • Nom: ${entry.patientName || entry.nomClient || 'N/A'}`);
            console.log(`   • ID CSR: ${entry.patientId || entry.numID_CSR || 'N/A'}`);
            console.log(`   • Service: ${journalType}`);
            
            // ÉCRIRE DANS LE JOURNAL CORRESPONDANT
            const result = await writeToJournal(journalType, entry);
            
            // Notifier tous les clients
            socketIO.emit('journal_updated', {
                type: journalType,
                entry: result,
                timestamp: new Date().toISOString()
            });
            
            console.log(`✅ Journal ${journalType} mis à jour avec succès!`);
            
            if (callback) {
                callback({
                    success: true,
                    message: `Entrée ajoutée au journal ${journalType}`,
                    entry: result,
                    filePath: BASE_DATABASE_PATH
                });
            }
            
        } catch (error) {
            console.error(`❌ Erreur add_to_journal: ${error.message}`);
            
            if (callback) {
                callback({
                    success: false,
                    message: `Échec: ${error.message}`,
                    error: error.message
                });
            }
        }
    });
    
    // ============================================================================
    // GESTIONNAIRE POUR L'ENREGISTREMENT DES PATIENTS (labo)
    // ============================================================================
    
    socket.on('labo', async (patientData, callback) => {
        console.log(`\n👤 [SOCKET] Enregistrement patient: ${patientData.nomClient}`);
        
        try {
            // 1. Sauvegarder dans labo.json
            let patients = [];
            try {
                const content = await fs.readFile(LABO_FILE, 'utf8');
                patients = content.trim() ? JSON.parse(content) : [];
            } catch {
                patients = [];
            }
            
            // Générer un ID client
            if (!patientData.numClient || patientData.numClient === '0') {
                patientData.numClient = patients.length + 1;
            }
            
            patientData.dateCreation = new Date().toISOString();
            patients.push(patientData);
            
            await fs.writeFile(LABO_FILE, JSON.stringify(patients, null, 2));
            
            // 2. Sauvegarder dans les journaux des services sélectionnés
            const servicesSelectionnes = patientData.servicesSelectionnes || [];
            
            console.log(`📝 Services à journaliser: ${servicesSelectionnes.length}`);
            
            for (const service of servicesSelectionnes) {
                try {
                    const serviceName = typeof service === 'object' ? service.value : service;
                    const serviceLabel = typeof service === 'object' ? service.name : service;
                    
                    console.log(`   • Journalisation pour: ${serviceName} (${serviceLabel})`);
                    
                    const journalEntry = {
                        ...patientData,
                        journalType: serviceName,
                        service: serviceName,
                        serviceName: serviceLabel,
                        patientName: patientData.nomClient,
                        patientId: patientData.numID_CSR,
                        caisseUser: patientData.caisseUser || 'Système',
                        totalAmount: patientData.total_OP,
                        examens: patientData.examensSelectionnes || [],
                        dateService: new Date().toISOString()
                    };
                    
                    // Écrire dans le journal correspondant
                    await writeToJournal(serviceName, journalEntry);
                    
                    console.log(`   ✅ ${serviceName} journalisé`);
                    
                } catch (serviceError) {
                    console.error(`   ❌ Erreur service ${service}: ${serviceError.message}`);
                }
            }
            
            // Réponse au client
            if (callback) {
                callback({
                    success: true,
                    message: "Patient enregistré avec succès",
                    numClient: patientData.numClient,
                    servicesJournalised: servicesSelectionnes.length
                });
            }
            
            // Notifier tous les clients
            socketIO.emit('nouveau_patient', patientData);
            
        } catch (error) {
            console.error(`❌ Erreur enregistrement patient: ${error.message}`);
            
            if (callback) {
                callback({
                    success: false,
                    message: `Erreur: ${error.message}`
                });
            }
        }
    });
    
    // ============================================================================
    // AUTRES GESTIONNAIRES
    // ============================================================================
    
    socket.on('verify_user_credentials', (credentials, callback) => {
        const user = usersDatabase.find(u => 
            u.username === credentials.username && 
            u.password === credentials.password
        );
        
        if (user && callback) {
            callback({
                success: true,
                user: user,
                message: "Authentification réussie"
            });
        } else if (callback) {
            callback({
                success: false,
                message: "Identifiants incorrects"
            });
        }
    });
    
    socket.on('disconnect', () => {
        console.log(`🔌 Déconnexion: ${socket.id}`);
    });
});

// ====================================================================================
// ROUTES API POUR DEBUG ET VÉRIFICATION
// ====================================================================================

app.get('/', (req, res) => {
    res.json({
        message: "Serveur CSR Backend",
        status: "OK",
        databasePath: BASE_DATABASE_PATH,
        timestamp: new Date().toISOString()
    });
});

// Route pour voir l'état de tous les journaux
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
                    file: journal.file,
                    entries: data.length,
                    lastEntry: data[0] ? data[0].timestamp : 'Aucune',
                    size: content.length
                });
            } catch (error) {
                status.push({
                    name: journal.name,
                    file: journal.file,
                    error: error.message,
                    exists: false
                });
            }
        }
        
        res.json({
            success: true,
            basePath: BASE_DATABASE_PATH,
            cwd: process.cwd(),
            journals: status,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Route pour tester l'écriture dans un journal
app.post('/api/test/journal/:journalType', async (req, res) => {
    try {
        const { journalType } = req.params;
        const testEntry = req.body || {
            test: true,
            message: "Entrée de test",
            patientName: "Test Patient",
            patientId: "TEST123",
            timestamp: new Date().toISOString()
        };
        
        const result = await writeToJournal(journalType, testEntry);
        
        res.json({
            success: true,
            message: `Test d'écriture dans ${journalType}`,
            entry: result,
            journalType: journalType,
            filePath: BASE_DATABASE_PATH
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Route pour voir le contenu d'un journal
app.get('/api/journals/:journalType', async (req, res) => {
    try {
        const { journalType } = req.params;
        const { limit = 10 } = req.query;
        
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
            return res.status(400).json({
                success: false,
                message: `Type de journal inconnu: ${journalType}`
            });
        }
        
        let data = [];
        try {
            const content = await fs.readFile(journalFile, 'utf8');
            data = content.trim() ? JSON.parse(content) : [];
        } catch {
            data = [];
        }
        
        const limitedData = data.slice(0, parseInt(limit));
        
        res.json({
            success: true,
            journalType: journalType,
            filePath: journalFile,
            totalEntries: data.length,
            entries: limitedData,
            exists: data.length > 0
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Route pour créer un dossier manuellement
app.post('/api/create-directory', async (req, res) => {
    try {
        const { path: dirPath } = req.body;
        const targetPath = dirPath || BASE_DATABASE_PATH;
        
        fsSync.mkdirSync(targetPath, { recursive: true });
        
        // Lister les fichiers créés
        const files = fsSync.readdirSync(targetPath);
        
        res.json({
            success: true,
            message: `Dossier créé: ${targetPath}`,
            path: targetPath,
            files: files,
            cwd: process.cwd()
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
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
        
        // 1. Afficher les informations système
        console.log(`📂 Répertoire courant: ${process.cwd()}`);
        console.log(`📂 __dirname: ${__dirname}`);
        console.log(`🎯 Base de données: ${BASE_DATABASE_PATH}`);
        
        // 2. Créer le dossier si nécessaire
        fsSync.mkdirSync(BASE_DATABASE_PATH, { recursive: true });
        console.log(`✅ Dossier base de données prêt`);
        
        // 3. Initialiser tous les fichiers
        await initializeAllJournals();
        
        // 4. Initialiser les utilisateurs
        await initializeUsers();
        
        // 5. Démarrer le serveur
        http.listen(PORT, '0.0.0.0', () => {
            console.log('\n==================================================');
            console.log('🎉 SERVEUR DÉMARRÉ AVEC SUCCÈS!');
            console.log('==================================================');
            console.log(`📡 Port: ${PORT}`);
            console.log(`📁 Base de données: ${BASE_DATABASE_PATH}`);
            console.log(`🔌 Socket.IO: PRÊT`);
            console.log(`👤 Utilisateurs: ${usersDatabase.length}`);
            console.log('\n📊 JOURNAUX DISPONIBLES:');
            console.log(`   • Laboratoire: ${JOURNAL_LABO_FILE}`);
            console.log(`   • Consultation: ${JOURNAL_CONSULT_FILE}`);
            console.log(`   • Caisse: ${JOURNAL_CAISSE_FILE}`);
            console.log(`   • Chirurgie: ${JOURNAL_CHIRURGIE_FILE}`);
            console.log(`   • Échographie: ${JOURNAL_ECHOGRAPHIE_FILE}`);
            console.log(`   • Hospitalisation: ${JOURNAL_HOSPITALISATION_FILE}`);
            console.log(`   • Kinésithérapie: ${JOURNAL_KINESITHERAPIE_FILE}`);
            console.log(`   • Fibroscopie: ${JOURNAL_FIBROSCOPIE_FILE}`);
            console.log('\n🔗 URLS DE TEST:');
            console.log(`   • Vérifier journaux: http://localhost:${PORT}/api/journals/status`);
            console.log(`   • Tester écriture: http://localhost:${PORT}/api/test/journal/laboratoire`);
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
