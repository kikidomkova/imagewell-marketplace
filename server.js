const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const nodemailer = require('nodemailer');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

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

// CONFIGURÁCIA E-MAILU (Google Workspace ImageWell)
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: "kapas@imagewell.eu",
        pass: "elerayobnklglpdj"
    }
});

function sendAdminEmail(orderDetail) {
    const mailOptions = {
        from: '"ImageWell Marketplace" <kapas@imagewell.eu>',
        to: "kapas@imagewell.eu",
        subject: "🚨 Nová žiadosť o schválenie reklamy!",
        html: `
            <div style="font-family: sans-serif; max-width: 600px; background: #1a1a1a; color: #fff; padding: 30px; border-radius: 8px; border: 1px solid #2c2c2c;">
                <h2 style="color: #ff0055; margin-bottom: 20px;">Dobrý deň, ImageWell tím,</h2>
                <p style="font-size: 16px; line-height: 1.5;">V systéme pribudla nová žiadosť o nasadenie reklamy na schválenie.</p>
                <hr style="border: 0; border-top: 1px solid #333; margin: 20px 0;">
                <table style="width: 100%; color: #eee; font-size: 14px; border-spacing: 0 8px;">
                    <tr><td style="color: #888; width: 130px;">Obrazovka:</td><td><strong>${orderDetail.led}</strong></td></tr>
                    <tr><td style="color: #888;">Plánovaný čas:</td><td>${orderDetail.startDate} do ${orderDetail.endDate} (${orderDetail.days} dní)</td></tr>
                    <tr><td style="color: #888;">Dĺžka slučky:</td><td>${orderDetail.loopLength} sekúnd</td></tr>
                    <tr><td style="color: #888;">Názov súboru:</td><td style="font-family: monospace;">${orderDetail.fileName}</td></tr>
                    <tr><td style="color: #888;">Typ formátu:</td><td style="text-transform: uppercase; color: #ff0055; font-weight: bold;">${orderDetail.fileType}</td></tr>
                    <tr><td style="color: #888;">Vypočítaná cena:</td><td style="color: #2ecc71; font-weight: bold;">${orderDetail.price} €</td></tr>
                </table>
                <hr style="border: 0; border-top: 1px solid #333; margin: 20px 0;">
                <a href="http://localhost:3000/admin" style="background: #ff0055; color: #fff; text-decoration: none; padding: 12px 25px; border-radius: 4px; font-weight: bold; display: inline-block;">Prejsť do Admin Control</a>
            </div>
        `
    };
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) console.log("E-mail sa nepodarilo odoslať: ", error);
    });
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

io.on('connection', (socket) => {
    console.log('Live spojenie funguje.');
});

// ROUTY
app.get('/', (req, res) => res.render('login', { error: null }));

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const users = readData(usersFile);
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
    
    if (user) {
        if (user.username.toLowerCase() === 'admin') res.redirect('/admin');
        else res.redirect('/dashboard');
    } else {
        res.render('login', { error: 'Nesprávne meno alebo heslo!' });
    }
});

app.get('/register', (req, res) => res.render('register', { success: null, error: null }));
app.post('/register', (req, res) => {
    const { username, password, confirmPassword } = req.body;
    let users = readData(usersFile);
    if (password !== confirmPassword) return res.render('register', { success: null, error: 'Heslá sa nezhodujú!' });
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) return res.render('register', { success: null, error: 'Meno už existuje!' });

    users.push({ username, password, role: 'client' });
    writeData(usersFile, users);
    res.render('register', { success: 'Registrácia úspešná!', error: null });
});

app.get('/dashboard', (req, res) => {
    const orders = readData(dbFile);
    let totalDays = 0, activeCampaigns = 0, totalSpent = 0;

    orders.forEach(o => {
        totalDays += o.days || 0;
        if (o.status.startsWith('Zaplatené')) {
            totalSpent += parseFloat(o.price) || 0;
            activeCampaigns++;
        }
    });

    res.render('dashboard', { 
        orders: orders,
        stats: { days: totalDays, active: activeCampaigns, spent: totalSpent.toFixed(2) }
    });
});

app.post('/check-capacity', (req, res) => {
    const { led, startDate, endDate } = req.body;
    const orders = readData(dbFile);
    const targetStart = new Date(startDate);
    const targetEnd = new Date(endDate);
    
    let overlappingCount = 0;
    orders.forEach(o => {
        if (o.led === led) {
            const oStart = new Date(o.startDate);
            const oEnd = new Date(o.endDate);
            if (targetStart <= oEnd && targetEnd >= oStart) overlappingCount++;
        }
    });

    let status = "🟢 Voľná kapacita panela";
    let color = "#2ecc71";
    if (overlappingCount >= 2 && overlappingCount < 4) {
        status = "🟡 Výrazná obsadenosť slučky";
        color = "#e67e22";
    } else if (overlappingCount >= 4) {
        status = "🔴 Panel je na vybraný termín plný";
        color = "#e74c3c";
    }

    res.json({ count: overlappingCount, status: status, color: color });
});

app.post('/submit-campaign', upload.single('file'), (req, res) => {
    if (!req.file) return res.send("Chyba: Súbor chýba.");
    
    const isVideo = req.file.mimetype.includes('video');
    const loopLength = parseInt(req.body.loopLength) || 10;

    if (isVideo && loopLength > 60) {
        fs.unlinkSync(req.file.path);
        return res.send("Chyba: Maximálna dĺžka videa v systéme ImageWell je 60 sekúnd.");
    }

    const start = new Date(req.body.startDate);
    const end = new Date(req.body.endDate);
    const days = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 3600 * 24)) || 1;
    
    // Výpočet ceny na základe lokácií a rozmerov
    let baseRate = req.body.led.includes('Apolo') || req.body.led.includes('Bajkalska') ? 30 : 25;
    let totalPrice = days * baseRate * (loopLength / 10);
    if (isVideo) totalPrice += 40; // manipulačný poplatok

    const newOrder = {
        id: Date.now(),
        led: req.body.led,
        startDate: req.body.startDate,
        endDate: req.body.endDate,
        days: days,
        loopLength: loopLength,
        fileUrl: `/uploads/${req.file.filename}`,
        fileName: req.file.originalname,
        fileType: isVideo ? 'video' : 'image',
        price: totalPrice.toFixed(2),
        status: 'Čaká na schválenie'
    };

    let orders = readData(dbFile);
    orders.push(newOrder);
    writeData(dbFile, orders);

    io.emit('newCampaignNotification', newOrder);
    sendAdminEmail(newOrder);

    res.redirect('/dashboard');
});

app.post('/pay-campaign', (req, res) => {
    const { orderId, method } = req.body;
    let orders = readData(dbFile);
    const orderIndex = orders.findIndex(o => o.id === parseInt(orderId));
    
    if (orderIndex !== -1 && orders[orderIndex].status === 'Schválené (Čaká na platbu)') {
        orders[orderIndex].status = method === 'invoice' ? 'Zaplatené (Faktúra vystavená)' : 'Zaplatené (Kartou online)';
        writeData(dbFile, orders);
        return res.json({ success: true });
    }
    res.json({ success: false });
});

app.get('/admin', (req, res) => {
    const orders = readData(dbFile);
    let totalRevenue = 0, totalApprovedDays = 0;

    orders.forEach(o => {
        if (o.status.startsWith('Zaplatené')) {
            totalRevenue += parseFloat(o.price) || 0;
            totalApprovedDays += o.days || 0;
        }
    });

    res.render('admin', { 
        orders: orders,
        globalStats: { revenue: totalRevenue.toFixed(2), days: totalApprovedDays }
    });
});

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
            orders[orderIndex].status = action === 'approve' ? 'Schválené (Čaká na platbu)' : 'Zamietnuté';
        }
        writeData(dbFile, orders);
    }
    res.redirect('/admin');
});

server.listen(PORT, () => console.log(`Server beží na porti ${PORT}`));