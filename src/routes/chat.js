const express = require('express');
const router = express.Router();
const { GoogleGenAI } = require('@google/genai');
const { chatLimiter } = require('../middleware/rateLimit');

const apiKey = process.env.GEMINI_API_KEY;

// Initialize SDK
let ai;
if (apiKey) {
    ai = new GoogleGenAI({ apiKey: apiKey });
}

router.post('/', chatLimiter, async (req, res) => {
    try {
        const { message, history } = req.body;

        if (!message) {
            return res.status(400).json({ success: false, message: 'Message is required' });
        }

        if (!apiKey || !ai) {
             return res.status(503).json({ 
                 success: false, 
                 message: 'AI service is currently unavailable. Please setup the GEMINI_API_KEY in the backend.',
                 response: "I'm sorry, my AI backend is currently not configured with an API key."
             });
        }

        const systemInstruction = `You are a helpful customer support chatbot for RDA (Lorry Driver Booking Platform). 
You help users with general questions. Give concise and polite answers.
To book a driver, users log in as an owner and select a driver from the Search Drivers page.
Users can register as a Driver or an Owner.
Pricing is set by the drivers themselves, visible on their profile pages.
The support email is support@rda.com and phone is 1-800-RDA-HELP.`;

        // Format history for Gemini SDK if provided. The SDK expects contents to be array of objects with role and parts.
        const contents = [];
        if (history && Array.isArray(history)) {
            for (const msg of history) {
                contents.push({
                    role: msg.isUser ? 'user' : 'model',
                    parts: [{ text: msg.text }]
                });
            }
        }
        
        contents.push({ role: 'user', parts: [{ text: message }] });

        const response = await ai.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: contents,
            config: {
                systemInstruction: systemInstruction,
            }
        });

        res.json({
            success: true,
            response: response.response.text()
        });

    } catch (error) {
        console.error('Chatbot error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'An error occurred while communicating with the AI service.',
            response: "Oops! Something went wrong while I was trying to process your request." 
        });
    }
});

module.exports = router;
