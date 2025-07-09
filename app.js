// app.js

require('dotenv').config();

const express = require('express');
const shortid = require('shortid');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 3000;

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("Error: CLIENT_ID and CLIENT_SECRET environment variables are not set.");
    console.error("Please create a .env file in your project root with these variables.");
    process.exit(1);
}

console.log("Client ID loaded successfully.");

const urlDatabase = {};

app.use(express.json());

const myLoggingMiddleware = (req, res, next) => {
    console.warn("--- Reminder: Replace this placeholder with your actual Logging Middleware! ---");
    console.log(`[Placeholder Log - ${new Date().toISOString()}] ${req.method} ${req.url} from ${req.ip}`);
    next();
};
app.use(myLoggingMiddleware);

function generateShortCode() {
    let code;
    do {
        code = shortid.generate();
    } while (urlDatabase[code]);
    return code;
}

function isValidShortCode(code) {
    if (!/^[a-zA-Z0-9]+$/.test(code)) {
        return false;
    }
    if (code.length < 4 || code.length > 15) {
        return false;
    }
    return true;
}

app.post('/shorten', (req, res) => {
    const { longUrl, customShortCode, validityMinutes } = req.body;

    if (!longUrl) {
        return res.status(400).json({ error: "longUrl is required." });
    }
    try {
        new URL(longUrl);
    } catch (e) {
        return res.status(400).json({ error: "Invalid longUrl format." });
    }

    let shortCode;
    let customShortCodeUsed = false;

    if (customShortCode) {
        if (!isValidShortCode(customShortCode)) {
            return res.status(400).json({ error: "Invalid customShortCode. Must be alphanumeric and a reasonable length (4-15 characters)." });
        }
        if (urlDatabase[customShortCode]) {
            return res.status(409).json({ error: `Custom shortCode '${customShortCode}' is already in use. Please choose another.` });
        }
        shortCode = customShortCode;
        customShortCodeUsed = true;
    } else {
        shortCode = generateShortCode();
    }

    let minutes = parseInt(validityMinutes);
    if (isNaN(minutes) || minutes <= 0) {
        minutes = 30;
    }

    const expiresAt = new Date(Date.now() + minutes * 60 * 1000);

    urlDatabase[shortCode] = {
        originalUrl: longUrl,
        expiresAt: expiresAt,
        custom: customShortCodeUsed,
        clicks: 0
    };

    const shortUrl = `${req.protocol}://${req.get('host')}/${shortCode}`;

    res.status(201).json({
        shortUrl: shortUrl,
        originalUrl: longUrl,
        expiresAt: expiresAt.toISOString(),
        customShortCodeUsed: customShortCodeUsed
    });
});

app.get('/:shortCode', (req, res) => {
    const { shortCode } = req.params;
    const urlEntry = urlDatabase[shortCode];

    if (!urlEntry) {
        return res.status(404).json({ error: "Short URL not found." });
    }

    if (new Date() > urlEntry.expiresAt) {
        delete urlDatabase[shortCode];
        return res.status(410).json({ error: "Short URL has expired and is no longer available." });
    }

    urlEntry.clicks++;

    res.redirect(301, urlEntry.originalUrl);
});

app.get('/analytics/:shortCode', (req, res) => {
    const { shortCode } = req.params;
    const urlEntry = urlDatabase[shortCode];

    if (!urlEntry) {
        return res.status(404).json({ error: "Short URL not found for analytics." });
    }

    res.status(200).json({
        shortCode: shortCode,
        originalUrl: urlEntry.originalUrl,
        clicks: urlEntry.clicks,
        expiresAt: urlEntry.expiresAt.toISOString(),
        customShortCodeUsed: urlEntry.custom
    });
});

app.listen(PORT, () => {
    console.log(`URL Shortener Microservice listening on port ${PORT}`);
    console.log(`Access your service at: http://localhost:${PORT}/`);
    console.log(`Use this base URL for shortened links.`);
});
