const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const nodemailer = require('nodemailer');
const http = require('http'); // Potrebné pre Web Sockets (Real-time push-up)
const { Server } = require('socket.io'); // Potrebné pre Web Sockets (Real-time push-up)

const app = express();
const server = http.createServer(app); // Vytvorenie HTTP servera
const io = new Server(server); // Prepojenie servera so Socket.io

const PORT = process.env.PORT || 3000;
const uploadDir = './uploads';
const dbFile = './database.json';
const usersFile = './users.json';

// Automatické vytvorenie zložiek a databáz pri štarte, ak neexistujú
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, JSON.stringify([], null, 2));
if (!fs.existsSync(usersFile)) {
    fs.writeFileSync(usersFile, JSON.stringify([{ username: 'admin', password: 'adminpassword', role: 'admin' }], null, 2));
}

function readData(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; }
}
function writeData(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// -------------------------------------------------------------
// OSTRÁ CONFIGURÁCIA E-MAILU (Prepojené cez Google Workspace ImageWell)
// -------------------------------------------------------------
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: "kapas@imagewell.eu",
        pass: "elerayobnklglpdj" // Tvoje bezpečné 16-miestne heslo aplikácie
    }
});

// Funkcia na automatické odoslanie e-mailu adminovi
function sendAdminEmail(orderDetail) {
    const mailOptions = {
        from: '"ImageWell Marketplace" <kapas@imagewell.eu>',
        to: "kapas@imagewell.eu", // Doručenie priamo tebe do schránky
        subject: "🚨 Nová žiadosť o schválenie reklamy!",
        html: `
            <div style="font-family: sans-serif; max-width: 600px; background: #1a1a1a; color: #fff; padding: 30px; border-radius: 8px; border: 1px solid #2c2c2c;">
                <h2 style="color: #ff0055; margin-bottom: 20px;">Dobrý deň, ImageWell tím,</h2>
                <p style="font-size: 16px; line-height: 1.5;">V systéme pribudla nová žiadosť o nasadenie reklamy na schválenie.</p>
                <hr style="border: 0; border-top: 1px solid #333; margin: 20px 0;">
                <table style="width: 100%; color: #eee; font-size: 14px; border-spacing: 0 8px;">
                    <tr><td style="padding: 5px 0; color: #888; width: 130px;">Obrazovka:</td><td><strong>${orderDetail.led}</strong></td></tr>
                    <tr><td style="padding: 5px 0; color: #888;">Názov súboru:</td><td style="font-family: monospace;">${orderDetail.fileName}</td></tr>
                    <tr><td style="padding: 5px 0; color: #888;">Typ formátu:</td><td style="text-transform: uppercase; color: #ff0055; font-weight: bold;">${orderDetail.fileType}</td></tr>
                    <tr><td style="padding: 5px 0; color: #888;">Dátum zadania:</td><td>${orderDetail.date}</td></tr>
                </table>
                <hr style="border: 0; border-top: 1px solid #333; margin: 20px 0;">
                <p style="font-size: 14px; color: #aaa; margin-bottom: 25px;">Skontrolujte obsah, pozrite si vizuálny náhľad a schváľte alebo zamietnite ho v administrácii systému.</p>
                <a href="http://localhost:3000/admin" style="background: #ff0055; color: #fff; text-decoration: none; padding: 12px 25px; border-radius: 4px; font-weight: bold; display: inline-block;">Prejsť do Admin Control</a>
            </div>
        `
    };

    // Odoslanie prebieha na pozadí, zákazník nečaká na načítanie mailu
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log("E-mail sa nepodarilo odoslať: ", error);
        } else {
            console.log("Upozornenie úspešne odoslané na kapas@imagewell.eu: " + info.response);
        }
    });
}
// -------------------------------------------------------------

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // Limit 50MB na súbor
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['video/mp4', 'image/jpeg', 'image/png', 'image/jpg'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Povolené formáty sú iba .MP4, .JPG alebo .PNG!'), false);
        }
    }
});

io.on('connection', (socket) => {
    console.log('Okno sa pripojilo na real-time push notifikácie.');
});

// ROUTY

app.get('/', (req, res) => res.render('login', { error: null }));

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const users = readData(usersFile);
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
    
    if (user) {
        if (user.role === 'admin' || user.username.toLowerCase() === 'admin') {
            res.redirect('/admin');
        } else {
            res.redirect('/dashboard');
        }
    } else {
        res.render('login', { error: 'Nesprávne meno alebo heslo!' });
    }
});

app.get('/register', (req, res) => res.render('register', { success: null, error: null }));

app.post('/register', (req, res) => {
    const { username, password, confirmPassword } = req.body;
    let users = readData(usersFile);

    if (password !== confirmPassword) return res.render('register', { success: null, error: 'Heslá sa nezhodujú!' });
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) return res.render('register', { success: null, error: 'Používateľské meno už existuje!' });

    users.push({ username, password, role: 'client' });
    writeData(usersFile, users);
    res.render('register', { success: 'Registrácia úspešná! Teraz sa môžete prihlásiť.', error: null });
});

app.get('/dashboard', (req, res) => {
    res.render('dashboard', { orders: readData(dbFile) });
});

app.post('/submit-campaign', (req, res) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            return res.send(`<div style="background:#121212; color:#ff4444; font-family:sans-serif; height:100vh; display:flex; flex-direction:column; justify-content:center; align-items:center;"><h2>Chyba pri nahrávaní: ${err.message}</h2><br><a href="/dashboard" style="color:#fff; text-decoration:none; padding:10px 20px; background:#333; border-radius:4px;">Späť na Dashboard</a></div>`);
        }
        if (!req.file) return res.send("Nenahrali ste žiadny súbor.");

        const isVideo = req.file.mimetype.includes('video');

        const newOrder = {
            id: Date.now(),
            led: req.body.led === 'led28' ? 'LED 28 – Betliarska' : 'LED 15 – Prístavná',
            fileUrl: `/uploads/${req.file.filename}`,
            fileName: req.file.originalname,
            fileType: isVideo ? 'video' : 'image',
            status: 'Čaká na schválenie',
            date: new Date().toLocaleDateString('sk-SK')
        };

        let orders = readData(dbFile);
        orders.push(newOrder);
        writeData(dbFile, orders);

        // 🚨 Akcia 1: Real-time push notification na webe
        io.emit('newCampaignNotification', newOrder);

        // ✉️ Akcia 2: Reálny e-mail manažérovi
        sendAdminEmail(newOrder);

        res.redirect('/dashboard');
    });
});

app.get('/admin', (req, res) => res.render('admin', { orders: readData(dbFile) }));

app.post('/admin/action', (req, res) => {
    const { orderId, action } = req.body;
    let orders = readData(dbFile);
    const orderIndex = orders.findIndex(o => o.id === parseInt(orderId));
    
    if (orderIndex !== -1) {
        if (action === 'delete') {
            const filePath = path.join(__dirname, orders[orderIndex].fileUrl);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            orders.splice(orderIndex, 1);
        } else {
            orders[orderIndex].status = action === 'approve' ? 'Schválené (Odoslané do Avemeo)' : 'Zamietnuté';
        }
        writeData(dbFile, orders);
    }
    res.redirect('/admin');
});

server.listen(PORT, () => console.log(`Server úspešne beží s e-mailovými notifikáciami na porti ${PORT}`));