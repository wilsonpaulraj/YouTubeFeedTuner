window.YTEnhancer = window.YTEnhancer || {};
window.YTEnhancer.LLM = {};

window.YTEnhancer.LLM.getLLMResponse = async function (prompt) {
    const API_KEY = 'AIzaSyB8Ha0uHwNqFfVoD9iAjCQbH4Yb9rbGSO8';
    const RATE_LIMIT_DELAY = 1000;
    let lastRequestTime = 0;
    const MAX_RETRIES = 3;
    let retries = 0;

    // Debug the start of LLM request
    console.log("Making LLM request, prompt length:", prompt.length);

    while (retries < MAX_RETRIES) {
        try {
            if (retries > 0) {
                const backoffDelay = RATE_LIMIT_DELAY * Math.pow(2, retries);
                console.log(`Retry ${retries}/${MAX_RETRIES} after ${backoffDelay}ms`);
                await new Promise(resolve => setTimeout(resolve, backoffDelay));
            }

            const now = Date.now();
            const timeSinceLastRequest = now - lastRequestTime;
            if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
                const waitTime = RATE_LIMIT_DELAY - timeSinceLastRequest;
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
            lastRequestTime = Date.now();

            console.log("Sending request to LLM API...");
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${API_KEY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }]
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            console.log("Received response from API, status:", response.status);

            if (!response.ok) {
                throw new Error(`API request failed with status ${response.status}`);
            }

            const data = await response.json();
            console.log("Parsed JSON response successfully");

            // Check if data has the expected structure
            if (!data.candidates || !data.candidates.length === 0) {
                console.error('No candidates in API response:', data);
                throw new Error('No candidates in API response');
            }

            if (!data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
                console.error('Invalid content structure in API response:', data.candidates[0]);
                throw new Error('Invalid content structure in API response');
            }

            const generatedText = data.candidates[0].content.parts[0].text;
            console.log("Successfully extracted text from response");

            // For summary requests or doubt questions, we don't need to validate JSON
            if (prompt.includes('summarizer') || prompt.includes('You are an AI assistant helping a viewer understand a YouTube video') || prompt.includes('You are an AI assistant helping someone understand the content of a video')) {
                return generatedText;
            }

            // For all other requests, just return the generated text
            return generatedText;

        } catch (error) {
            console.error('LLM request error:', error.message, error.stack);

            if (error.name === 'AbortError') {
                window.YTEnhancer.Utils.showToast('Request timed out. Please try again.');
            } else if (error.message.includes('429')) {
                retries++;
                window.YTEnhancer.Utils.showToast(`Rate limited. Retrying... (${retries}/${MAX_RETRIES})`);
                if (retries === MAX_RETRIES) {
                    window.YTEnhancer.Utils.showToast('Too many requests. Please try again later.');
                }
            } else if (error.message.includes('Invalid JSON')) {
                window.YTEnhancer.Utils.showToast('Received invalid response. Please try again.');
            } else if (error.message.includes('Invalid API response structure') ||
                error.message.includes('No candidates') ||
                error.message.includes('Invalid content structure')) {
                window.YTEnhancer.Utils.showToast('Received an invalid response from the AI service.');
            } else {
                window.YTEnhancer.Utils.showToast('Failed to process request. Please try again.');
            }

            if (retries === MAX_RETRIES || !error.message.includes('429')) {
                throw error;
            }
        }
    }

    // If we've exhausted all retries
    throw new Error('Failed after maximum retry attempts');
};
