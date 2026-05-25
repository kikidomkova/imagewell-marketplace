const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Nastavenie EJS ako view engine
app.set('view engine', 'ejs');
// Nastavenie cesty k priečinku s pohľadmi (views)
app.set('views', path.join(__dirname, 'views'));

// Middleware pre spracovanie dát z formulára (pre budúci login systém)
app.use(express.urlencoded({ extended: true }));

// Hlavná routa (Domovská stránka) - vyrenderuje prihlasovací formulár
app.get('/', (req, res) => {
    res.render('login');
});

// Spustenie servera
app.listen(PORT, () => {
    console.log(`Server beží na http://localhost:${PORT}`);
});
