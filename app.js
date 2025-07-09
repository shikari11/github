// app.js

require('dotenv').config(); // Load environment variables from .env

const express = require('express');
const shortid = require('shortid'); // For generating short IDs
const { URL } = require('url'); // Built-in Node.js module for URL parsing

const app = express();
const PORT = process.env.PORT || 3000; // Use port 3000 by default, or an environment variable

// --- Your Client Credentials (loaded from .env) ---
// These are relevant if your microservice needs to interact with the external
// evaluation service for tasks like submitting results or fetching config.
// For the core URL shortening functionality itself, the prompt states users are pre-authorized.
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("Error: CLIENT_ID and CLIENT_SECRET environment variables are not set.");
    console.error("Please create a .env file in your project root with these variables.");
    process.exit(1); // Exit if credentials are missing, as they are part of your setup
}

console.log("Client ID loaded successfully.");
// console.log("Client Secret loaded:", CLIENT_SECRET); // Avoid logging secrets in production environments


// --- Global Data Store (TEMPORARY: In-memory for demonstration) ---
// !!! IMPORTANT !!!
// For a production-ready service, this MUST be replaced with a persistent database
// (e.g., MongoDB, PostgreSQL, Redis, etc.) to store your URL mappings.
// Structure: { shortCode: { originalUrl: "...", expiresAt: Date, custom: boolean, clicks: number } }
const urlDatabase = {};


// --- Middleware ---
app.use(express.json()); // Middleware to parse JSON request bodies

// !!! CRITICAL: Replace this with your actual Logging Middleware !!!
// The challenge explicitly states: "Use of inbuilt language loggers or console logging is not allowed."
// You MUST integrate the specific logging solution provided in your "Pre-Test Setup" document.
const myLoggingMiddleware = (req, res, next) => {
    // Example: If your logging solution exposes a global logger or a module to import:
    // const { logInfo, logError } = require('./your-logging-module');
    // logInfo(`[Incoming Request] ${req.method} ${req.url} from ${req.ip}`);
    // logInfo(`Request Body: ${JSON.stringify(req.body)}`); // Be careful logging sensitive data

    // --- TEMPORARY CONSOLE LOG (REMOVE AFTER INTEGRATING REAL LOGGING) ---
    console.warn("--- Reminder: Replace this placeholder with your actual Logging Middleware! ---");
    console.log(`[Placeholder Log - ${new Date().toISOString()}] ${req.method} ${req.url} from ${req.ip}`);
    // --- END TEMPORARY LOG ---

    next(); // Pass control to the next middleware/route handler
};
app.use(myLoggingMiddleware);


// --- Helper Functions ---

/**
 * Generates a unique short code.
 * For true global uniqueness in a distributed system,
 * consider a more robust ID generation strategy or a centralized service.
 */
function generateShortCode() {
    let code;
    do {
        code = shortid.generate();
    } while (urlDatabase[code]); // Ensure it's unique in our current in-memory DB
    return code;
}

/**
 * Validates a custom short code based on requirements (alphanumeric, reasonable length).
 */
function isValidShortCode(code) {
    // Check for alphanumeric characters only
    if (!/^[a-zA-Z0-9]+$/.test(code)) {
        return false;
    }
    // Check for a reasonable length (e.g., between 4 and 15 characters, adjust as needed)
    if (code.length < 4 || code.length > 15) {
        return false;
    }
    return true;
}

// --- API Endpoints ---

/**
 * POST /shorten
 * Creates a new shortened URL.
 * Request Body:
 * {
 * "longUrl": "https://example.com/very/long/url",
 * "customShortCode": "mycode" (optional, alphanumeric, reasonable length),
 * "validityMinutes": 60 (optional, integer, defaults to 30)
 * }
 * Response:
 * {
 * "shortUrl": "http://hostname:port/mycode",
 * "originalUrl": "...",
 * "expiresAt": "ISOString",
 * "customShortCodeUsed": true/false
 * }
 */
app.post('/shorten', (req, res) => {
    const { longUrl, customShortCode, validityMinutes } = req.body;

    // 1. Validate longUrl
    if (!longUrl) {
        return res.status(400).json({ error: "longUrl is required." });
    }
    try {
        new URL(longUrl); // Basic validation to ensure it's a valid URL format
    } catch (e) {
        return res.status(400).json({ error: "Invalid longUrl format." });
    }

    let shortCode;
    let customShortCodeUsed = false;

    // 2. Handle customShortCode
    if (customShortCode) {
        if (!isValidShortCode(customShortCode)) {
            return res.status(400).json({ error: "Invalid customShortCode. Must be alphanumeric and a reasonable length (4-15 characters)." });
        }
        if (urlDatabase[customShortCode]) {
            return res.status(409).json({ error: `Custom shortCode '${customShortCode}' is already in use. Please choose another.` }); // 409 Conflict
        }
        shortCode = customShortCode;
        customShortCodeUsed = true;
    } else {
        shortCode = generateShortCode();
    }

    // 3. Handle validityMinutes
    let minutes = parseInt(validityMinutes);
    if (isNaN(minutes) || minutes <= 0) {
        minutes = 30; // Default validity as per requirements
    }

    // Calculate expiration time
    const expiresAt = new Date(Date.now() + minutes * 60 * 1000);

    // 4. Store the URL mapping (!!! REMEMBER TO USE A DATABASE HERE !!!)
    urlDatabase[shortCode] = {
        originalUrl: longUrl,
        expiresAt: expiresAt,
        custom: customShortCodeUsed,
        clicks: 0 // Initialize click count for analytics
    };

    const shortUrl = `${req.protocol}://${req.get('host')}/${shortCode}`;

    // 5. Send success response
    res.status(201).json({ // 201 Created
        shortUrl: shortUrl,
        originalUrl: longUrl,
        expiresAt: expiresAt.toISOString(),
        customShortCodeUsed: customShortCodeUsed
    });
});

/**
 * GET /:shortCode
 * Redirects to the original long URL.
 */
app.get('/:shortCode', (req, res) => {
    const { shortCode } = req.params;
    const urlEntry = urlDatabase[shortCode];

    // 1. Check if short URL exists
    if (!urlEntry) {
        return res.status(404).json({ error: "Short URL not found." }); // 404 Not Found
    }

    // 2. Check if short URL has expired
    if (new Date() > urlEntry.expiresAt) {
        // Optionally, remove expired entries from DB here in a real system
        delete urlDatabase[shortCode]; // Remove from in-memory DB
        return res.status(410).json({ error: "Short URL has expired and is no longer available." }); // 410 Gone
    }

    // 3. Increment click count (!!! REMEMBER TO UPDATE DATABASE !!!)
    urlEntry.clicks++; // Update in-memory for now

    // 4. Perform the redirection
    res.redirect(301, urlEntry.originalUrl); // 301 Permanent Redirect is common for shorteners
                                            // You might also use 302 Found or 307 Temporary Redirect
                                            // depending on specific semantic requirements.
});

// --- Optional: Analytics Endpoint (if required by "basic analytical capabilities") ---
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


// --- Server Start ---
app.listen(PORT, () => {
    console.log(`URL Shortener Microservice listening on port ${PORT}`);
    console.log(`Access your service at: http://localhost:${PORT}/`);
    console.log(`Use this base URL for shortened links.`);
});