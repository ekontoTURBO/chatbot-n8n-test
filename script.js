
document.addEventListener('DOMContentLoaded', () => {
    const chatBox = document.getElementById('chat-box');
    const userInput = document.getElementById('user-input');
    const chatForm = document.getElementById('chat-form');
    const sendBtn = document.getElementById('send-btn');
    const emailModal = document.getElementById('email-modal');
    const emailForm = document.getElementById('email-form');
    const emailInput = document.getElementById('email-input');
    const openChatBtn = document.getElementById('open-chat-btn');
    const chatContainer = document.getElementById('chat-container');
    const webhookUrl = 'https://cognitra.online/webhook/2b2306d4-86d4-42ac-916f-edaf7288617c';

    let pendingMessage = '';

    // Hide chat on load, show button
    chatContainer.classList.add('chat-hidden');
    openChatBtn.style.display = 'block';

    openChatBtn.addEventListener('click', () => {
        chatContainer.classList.remove('chat-hidden');
        chatContainer.classList.add('chat-visible');
        openChatBtn.style.display = 'none';
        // Focus input after animation
        setTimeout(() => {
            userInput.focus();
        }, 500);
    });

    chatForm.addEventListener('submit', (event) => {
        event.preventDefault();
        handleUserSubmit();
    });

    emailForm.addEventListener('submit', (event) => {
        event.preventDefault();
        handleEmailSubmit();
    });

    /**
     * Gets a session ID from sessionStorage or creates a new one.
     * This ensures the same ID is used for the entire browser tab session.
     */
    function getSessionId() {
        let sessionId = sessionStorage.getItem('chatSessionId');
        if (!sessionId) {
            sessionId = crypto.randomUUID(); // Modern, secure way to get a unique ID
            sessionStorage.setItem('chatSessionId', sessionId);
        }
        return sessionId;
    }

    function addMessage(message, sender) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', sender === 'user' ? 'user-message' : 'bot-message');
        messageElement.textContent = message;
        chatBox.appendChild(messageElement);
        scrollToBottom();
    }

    function showTypingIndicator() {
        const typingIndicator = document.createElement('div');
        typingIndicator.id = 'typing-indicator';
        typingIndicator.classList.add('message', 'bot-message');
        typingIndicator.innerHTML = '<span></span><span></span><span></span>';
        chatBox.appendChild(typingIndicator);
        scrollToBottom();
    }

    function hideTypingIndicator() {
        const typingIndicator = document.getElementById('typing-indicator');
        if (typingIndicator) {
            chatBox.removeChild(typingIndicator);
        }
    }

    function scrollToBottom() {
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    function handleUserSubmit() {
        const messageText = userInput.value.trim();
        if (messageText === '') return;

        const userEmail = sessionStorage.getItem('userEmail');

        if (!userEmail) {
            pendingMessage = messageText;
            emailModal.classList.remove('hidden');
            emailInput.focus();
        } else {
            processAndSendMessage(messageText);
        }
    }

    function handleEmailSubmit() {
        const email = emailInput.value.trim();
        if (email && email.includes('@')) { // Simple validation
            sessionStorage.setItem('userEmail', email);
            emailModal.classList.add('hidden');

            if (pendingMessage) {
                processAndSendMessage(pendingMessage);
                pendingMessage = '';
            }
        } else {
            alert('Proszę podać prawidłowy adres e-mail.');
        }
    }

    async function processAndSendMessage(messageText) {
         addMessage(messageText, 'user');
        userInput.value = '';
        userInput.disabled = true;
        sendBtn.disabled = true;

        showTypingIndicator();

        const sessionId = getSessionId();
        const userEmail = sessionStorage.getItem('userEmail');

        try {
            // Send message to the webhook
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                // Include the message and the session ID in the payload
                body: JSON.stringify({ message: messageText, sessionId: sessionId, email: userEmail }),
            });

            hideTypingIndicator();

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            // Log the raw data to the console for easy debugging
            console.log('Received from webhook:', JSON.stringify(data, null, 2));

            const botReply = parseBotReply(data);

            addMessage(botReply, 'bot');

        } catch (error) {
            hideTypingIndicator();
            // Log the full error object for better debugging in the console
            console.error('Fetch Error:', error);

            let userErrorMessage = 'Przepraszam, coś poszło nie tak. Proszę spróbować ponownie później.';
            if (error.message.startsWith('HTTP error!')) {
                // Extract status code for a more informative message
                userErrorMessage = `Serwer odpowiedział błędem: ${error.message}. Upewnij się, że proces n8n jest aktywny.`;
            } else if (error instanceof TypeError) {
                // A TypeError often indicates a network or CORS issue.
                userErrorMessage = 'Nie można połączyć się z serwerem czatbota. Często jest to spowodowane polityką CORS na webhooku. Sprawdź konsolę przeglądarki (F12), aby uzyskać bardziej szczegółowy komunikat o błędzie.';
            }
            addMessage(userErrorMessage, 'bot');
        } finally {
            // Re-enable input fields regardless of success or failure
            userInput.disabled = false;
            sendBtn.disabled = false;
            userInput.focus();
        }
    }

    function parseBotReply(data) {
        // This function is designed to find the text response from various n8n return formats.
        if (typeof data !== 'object' || data === null) {
            return 'Przepraszam, otrzymałem nieprawidłową odpowiedź.';
        }

        // Case 1: n8n's default "Respond to Webhook" format is an array.
        if (Array.isArray(data) && data.length > 0) {
            const firstItem = data[0];
            // The actual data is often nested inside a 'json' property.
            const responseData = firstItem.json || firstItem;
            
            // Look for common keys. 'text' is standard for n8n's AI nodes.
            if (responseData.text) return responseData.text;
            if (responseData.message) return responseData.message;
            if (responseData.reply) return responseData.reply;
            if (responseData.output) return responseData.output;
        }

        // Case 2: n8n is set to respond with a single JSON object (not in an array).
        if (data.text) return data.text;
        if (data.message) return data.message;
        if (data.reply) return data.reply;
        if (data.output) return data.output;

        // Fallback: If no standard key is found, stringify the first item or the whole object for debugging.
        const fallbackResponse = Array.isArray(data) && data.length > 0 ? data[0] : data;
        return `Otrzymano nieobsługiwany format. Sprawdź konsolę, aby uzyskać szczegóły. Dane: ${JSON.stringify(fallbackResponse)}`;
    }
});