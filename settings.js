const backBtn = document.getElementById('back-btn');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const userNameInput = document.getElementById('user-name');
const apiKeyInput = document.getElementById('api-key');

// Load existing settings from localStorage
function loadSettings() {
    const userName = localStorage.getItem('userName');
    const apiKey = localStorage.getItem('openaiApiKey'); // We won't actually display the saved key

    if (userName) {
        userNameInput.value = userName;
    }
    // We don't populate the API key field for security, 
    // but you could indicate if one is saved.
    if (apiKey) {
        apiKeyInput.placeholder = 'API Key is saved';
    }
}

// Save settings to localStorage
saveSettingsBtn.addEventListener('click', () => {
    const userName = userNameInput.value.trim();
    const apiKey = apiKeyInput.value.trim();

    if (userName) {
        localStorage.setItem('userName', userName);
    } else {
        localStorage.removeItem('userName'); // Remove if empty
    }

    if (apiKey) {
        localStorage.setItem('openaiApiKey', apiKey);
        apiKeyInput.value = ''; // Clear the input after saving
        apiKeyInput.placeholder = 'API Key is saved';
        alert('Settings saved!');
    } else {
        // Only show alert if user tried to save without entering anything *new*
        // If they just wanted to save the name, that's fine.
        if (apiKeyInput.placeholder !== 'API Key is saved') {
             alert('Please enter an API key to save.');
        }
    }
     // Optionally, provide feedback that settings were saved
     console.log('Settings saved');
});

// Navigate back to the main page
backBtn.addEventListener('click', () => {
    window.location.href = 'index.html';
});

// Load settings when the page loads
loadSettings(); 