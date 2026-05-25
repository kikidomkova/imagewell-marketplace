const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const uploadDir = './uploads';
const dbFile = './database.json';
const usersFile = './users.json';

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
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        // ROZŠÍRENIE: Povolené formáty sú teraz MP4, JPEG a PNG
        const allowedTypes = ['video/mp4', 'image/jpeg', 'image/png', 'image/jpg'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Povolené formáty sú len .MP4, .JPG alebo .PNG!'), false);
        }
    }
});

// LOGIN & REGISTRÁCIA
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
    res.render('register', { success: 'Registrácia úspešna! Teraz sa môžete prihlásiť.', error: null });
});

// DASHBOARD
app.get('/dashboard', (req, res) => {
    res.render('dashboard', { orders: readData(dbFile) });
});

app.post('/submit-campaign', (req, res) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            return res.send(`<div style="background:#121212; color:#ff4444; font-family:sans-serif; height:100vh; display:flex; flex-direction:column; justify-content:center; align-items:center;"><h2>Chyba pri nahrávaní: ${err.message}</h2><br><a href="/dashboard" style="color:#fff;">Späť</a></div>`);
        }
        if (!req.file) return res.send("Nenahrali ste žiadny súbor.");

        // Zistíme, či ide o obrázok alebo video
        const isVideo = req.file.mimetype.includes('video');

        let orders = readData(dbFile);
        orders.push({
            id: Date.now(),
            led: req.body.led === 'led28' ? 'LED 28 – Betliarska' : 'LED 15 – Prístavná',
            fileUrl: `/uploads/${req.file.filename}`,
            fileName: req.file.originalname,
            fileType: isVideo ? 'video' : 'image', // Uložíme si typ súboru
            status: 'Čaká na schválenie',
            date: new Date().toLocaleDateString('sk-SK')
        });
        writeData(dbFile, orders);
        res.redirect('/dashboard');
    });
});

// ADMIN ZONE
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

app.listen(PORT, () => console.log(`Server beží na porti ${PORT}`));