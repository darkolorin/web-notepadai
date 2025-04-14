const settingsBtn = document.getElementById('settings-btn');
const dictateBtn = document.getElementById('dictate-btn');
const summarizeBtn = document.getElementById('summarize-btn');
const exploreBtn = document.getElementById('explore-btn');
const pitchBtn = document.getElementById('pitch-btn');
const noteContent = document.getElementById('note-content');
const noteList = document.getElementById('note-list');
const newNoteBtn = document.getElementById('new-note-btn');
const saveNoteBtn = document.getElementById('save-note-btn');
const contextualActionContainer = document.getElementById('contextual-action-container');
const contextualActionBtn = document.getElementById('contextual-action-btn');
// const noteTitleInput = document.getElementById('note-title'); // If using title input

// --- State --- 
let currentNoteId = null;
let notes = []; // In-memory store of notes
let suggestionTimeout = null;
const SUGGESTION_DEBOUNCE_DELAY = 1500; // milliseconds (1.5 seconds)

// --- MediaRecorder and Whisper Integration ---
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
const OPENAI_AUDIO_API_URL = 'https://api.openai.com/v1/audio/transcriptions';

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // Prioritize iOS/Safari compatible types first
        const mimeTypesToTry = [
            'audio/mp4', // Preferred by Safari/iOS
            'audio/aac', // Alternative AAC container
            'audio/wav',
            'audio/ogg; codecs=opus',
            // Add 'audio/webm; codecs=opus'? Sometimes works better than default webm
            'audio/webm' // Common default, but check if Whisper likes the codec
        ];

        let supportedMimeType = '';
        for (const mimeType of mimeTypesToTry) {
            if (MediaRecorder.isTypeSupported(mimeType)) {
                supportedMimeType = mimeType;
                break;
            }
        }

        if (!supportedMimeType) {
            // If none of the specific types are supported, try with no options (browser default)
            console.warn('None of the preferred mimeTypes are supported. Falling back to browser default.');
            mediaRecorder = new MediaRecorder(stream);
        } else {
            const options = { mimeType: supportedMimeType };
            try {
                mediaRecorder = new MediaRecorder(stream, options);
                console.log('Using mimeType:', supportedMimeType);
            } catch (e) {
                console.warn(`Error initializing MediaRecorder with ${supportedMimeType}. Falling back to default.`, e);
                mediaRecorder = new MediaRecorder(stream); // Fallback on error
            }
        }

        console.log('Actual mimeType being used:', mediaRecorder.mimeType);

        audioChunks = []; // Reset chunks

        mediaRecorder.ondataavailable = event => {
            if (event.data.size > 0) {
                 audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            if (audioChunks.length === 0) {
                console.warn("No audio chunks recorded.");
                 // Reset UI properly if no audio was captured
                 isRecording = false;
                 dictateBtn.textContent = 'Start Dictation';
                 dictateBtn.disabled = false;
                return; // Don't proceed if no data
            }

            const mimeType = mediaRecorder.mimeType || 'audio/mp4'; // Get actual type, fallback to mp4
            let fileExtension = 'bin'; // Default extension

            // Map mime type to common extensions Whisper might support
            if (mimeType.includes('mp4') || mimeType.includes('m4a') || mimeType.includes('aac')) {
                fileExtension = 'm4a'; // Whisper supports m4a
            } else if (mimeType.includes('wav')) {
                fileExtension = 'wav';
            } else if (mimeType.includes('ogg')) {
                fileExtension = 'ogg';
            } else if (mimeType.includes('webm')) {
                fileExtension = 'webm';
            } else if (mimeType.includes('mpeg') || mimeType.includes('mp3')) {
                 fileExtension = 'mp3'; // Whisper supports mp3
            }

            const fileName = `recording.${fileExtension}`;
            console.log(`Creating Blob with type: ${mimeType}, filename: ${fileName}`);

            const audioBlob = new Blob(audioChunks, { type: mimeType });

            // Stop the tracks *after* blob creation
            stream.getTracks().forEach(track => track.stop());

            await transcribeAudio(audioBlob, dictateBtn, fileName);

            // Reset UI (already happens in transcribeAudio finally block, but belt-and-suspenders)
            isRecording = false;
            dictateBtn.textContent = 'Start Dictation';
            dictateBtn.disabled = false;
        };

        mediaRecorder.start();
        isRecording = true;
        dictateBtn.textContent = 'Stop Dictation';
        dictateBtn.disabled = false;
        console.log('Recording started...');

    } catch (err) {
        console.error('Error accessing microphone or starting recording:', err);
        alert('Could not access microphone or start recording. Please ensure permission is granted.');
        isRecording = false; // Reset state
        dictateBtn.textContent = 'Start Dictation';
        dictateBtn.disabled = false;
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        dictateBtn.disabled = true; // Disable while processing
        dictateBtn.textContent = 'Processing...';
        console.log('Recording stopped, processing...');
    }
}

async function transcribeAudio(audioBlob, buttonElement, filename = 'recording.webm') {
    const apiKey = getApiKey();
    if (!apiKey) {
        // Reset button state if API key is missing
        buttonElement.textContent = 'Start Dictation';
        buttonElement.disabled = false;
        isRecording = false; // Ensure state is reset
        return;
    }

    const formData = new FormData();
    formData.append('file', audioBlob, filename); // Use the passed filename
    formData.append('model', 'whisper-1');
    // Optional: add language if needed -> formData.append('language', 'en');

    buttonElement.disabled = true; // Keep disabled during API call
    buttonElement.textContent = 'Transcribing...';

    try {
        const response = await fetch(OPENAI_AUDIO_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`
                // Content-Type is set automatically by FormData
            },
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Whisper API Error:', errorData);
            throw new Error(`API Error (${response.status}): ${errorData.error?.message || 'Unknown error'}`);
        }

        const data = await response.json();
        const transcript = data.text?.trim();

        if (transcript) {
            noteContent.value += (noteContent.value ? ' ' : '') + transcript;
            checkTextArea(); // Update AI button states
            noteContent.scrollTop = noteContent.scrollHeight; // Scroll to bottom
        } else if (data.text === '') {
             console.log('Whisper returned empty transcript (likely silence).');
             // Optionally alert the user or just do nothing
        } else {
            throw new Error('No transcript received from API.');
        }

    } catch (error) {
        console.error('Error calling Whisper API:', error);
        alert(`Error transcribing audio: ${error.message}`);
    } finally {
        // Reset button state regardless of success/failure
        buttonElement.disabled = false;
        buttonElement.textContent = 'Start Dictation';
        isRecording = false; // Final state reset
    }
}

settingsBtn.addEventListener('click', () => {
    // In a real Electron app, this would open a new window or navigate differently.
    // For web testing, we'll just navigate the current window.
    window.location.href = 'settings.html';
});

dictateBtn.addEventListener('click', () => {
    // Replace the old SpeechRecognition logic with MediaRecorder logic
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
});

// --- OpenAI Integration --- 

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

function getApiKey() {
    const apiKey = localStorage.getItem('openaiApiKey');
    if (!apiKey) {
        alert('OpenAI API Key not found. Please set it in Settings.');
        window.location.href = 'settings.html'; // Redirect to settings
        return null;
    }
    return apiKey;
}

async function callOpenAI(prompt, buttonElement) {
    const apiKey = getApiKey();
    if (!apiKey) return; // Stop if no key

    const originalButtonText = buttonElement.textContent;
    buttonElement.disabled = true;
    buttonElement.textContent = 'Thinking...';

    try {
        const response = await fetch(OPENAI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo', // Or your preferred model
                messages: [
                    { role: 'system', content: 'You are a helpful assistant.' },
                    { role: 'user', content: prompt }
                ],
                max_tokens: 150 // Adjust as needed
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('OpenAI API Error:', errorData);
            throw new Error(`API Error (${response.status}): ${errorData.error?.message || 'Unknown error'}`);
        }

        const data = await response.json();
        const result = data.choices[0]?.message?.content.trim();

        if (result) {
            // Append result to the notes area
            noteContent.value += `\n\n--- ${originalButtonText} Result ---\n${result}`;
            noteContent.scrollTop = noteContent.scrollHeight; // Scroll to bottom
        } else {
            throw new Error('No content received from API.');
        }

    } catch (error) {
        console.error('Error calling OpenAI:', error);
        alert(`Error performing AI action: ${error.message}`);
    } finally {
        // Restore button state
        buttonElement.disabled = false;
        buttonElement.textContent = originalButtonText;
    }
}

summarizeBtn.addEventListener('click', () => {
    const text = noteContent.value.trim();
    if (text) {
        const prompt = `Please respond in the same language as the following text. Summarize the following text:
\n${text}`;
        callOpenAI(prompt, summarizeBtn);
    } else {
        alert('Nothing to summarize.');
    }
});

exploreBtn.addEventListener('click', () => {
    const text = noteContent.value.trim();
    if (text) {
        const prompt = `Please respond in the same language as the following text. Based on the following text, suggest 3 related ideas or directions to explore further:\n\n${text}`;
        callOpenAI(prompt, exploreBtn);
    } else {
        alert('Nothing to explore.');
    }
});

pitchBtn.addEventListener('click', () => {
    const text = noteContent.value.trim();
    if (text) {
        const userName = localStorage.getItem('userName') || 'I';
        const prompt = `Please respond in the same language as the following text. Turn the following notes from ${userName} into a brief, compelling pitch or elevator statement:\n\n${text}`;
        callOpenAI(prompt, pitchBtn);
    } else {
        alert('Nothing to make a pitch from.');
    }
});

// Initial check to disable AI buttons if textarea is empty
function checkTextArea() {
    const isEmpty = noteContent.value.trim() === '';
    summarizeBtn.disabled = isEmpty;
    exploreBtn.disabled = isEmpty;
    pitchBtn.disabled = isEmpty;
}

noteContent.addEventListener('input', checkTextArea);

// Run check on load
checkTextArea(); 

// --- Note Management --- 

function generateSimpleTitle(content) {
    const firstLine = content.split('\n')[0].trim();
    if (!firstLine) return 'Untitled Note';
    // Limit title length
    return firstLine.length > 40 ? firstLine.substring(0, 37) + '...' : firstLine;
}

function renderNoteList() {
    noteList.innerHTML = ''; // Clear existing list
    if (notes.length === 0) {
        noteList.innerHTML = '<li>No notes yet.</li>'; // Placeholder
        return;
    }
    notes.forEach(note => {
        const li = document.createElement('li');
        li.textContent = note.title;
        li.dataset.noteId = note.id;
        if (note.id === currentNoteId) {
            li.classList.add('active');
        }
        li.addEventListener('click', () => loadNote(note.id));
        noteList.appendChild(li);
    });
}

function saveNotesToStorage() {
    localStorage.setItem('notes', JSON.stringify(notes));
}

function loadNotesFromStorage() {
    const storedNotes = localStorage.getItem('notes');
    if (storedNotes) {
        notes = JSON.parse(storedNotes);
    } else {
        notes = [];
    }
    // Sort notes, maybe by last modified? For now, keep order.
    renderNoteList();
}

function loadNote(noteId) {
    const noteToLoad = notes.find(note => note.id === noteId);
    if (noteToLoad) {
        currentNoteId = noteId;
        noteContent.value = noteToLoad.content;
        renderNoteList();
        checkTextArea();
        console.log(`Loaded note: ${noteToLoad.title} (ID: ${noteId})`);
        // Trigger suggestion check after loading a note
        clearTimeout(suggestionTimeout); // Clear any pending from previous note
        getSuggestedAction(noteToLoad.content.trim()); // Check immediately on load
    } else {
        console.error('Note not found:', noteId);
        startNewNote();
    }
}

function saveCurrentNote() {
    const content = noteContent.value;
    if (!content.trim() && !currentNoteId) {
        alert("Cannot save an empty new note.");
        return; // Don't save empty new notes
    }

    const title = generateSimpleTitle(content);

    if (currentNoteId) {
        // Update existing note
        const noteIndex = notes.findIndex(note => note.id === currentNoteId);
        if (noteIndex > -1) {
            notes[noteIndex].title = title;
            notes[noteIndex].content = content;
            console.log(`Updated note: ${title}`);
        } else {
            console.error('Error updating: Note ID not found');
            // Handle error? Maybe create new?
            return;
        }
    } else {
        // Create new note
        const newNote = {
            id: Date.now().toString(), // Simple unique ID
            title: title,
            content: content
        };
        notes.push(newNote);
        currentNoteId = newNote.id; // Set the new note as current
        console.log(`Saved new note: ${title}`);
    }

    saveNotesToStorage();
    renderNoteList(); // Update sidebar
    alert('Note saved!'); // Simple feedback
}

function startNewNote() {
    currentNoteId = null;
    noteContent.value = '';
    // noteTitleInput.value = ''; // If using title input
    renderNoteList(); // Update sidebar to remove active state
    checkTextArea(); // Update AI buttons
    noteContent.focus();
    console.log('Started new note');
    contextualActionContainer.style.display = 'none'; // Hide for new notes
    clearTimeout(suggestionTimeout); // Clear any pending suggestion checks
}

// --- Event Listeners --- 

saveNoteBtn.addEventListener('click', saveCurrentNote);

newNoteBtn.addEventListener('click', startNewNote);

summarizeBtn.addEventListener('click', () => {
    const text = noteContent.value.trim();
    if (text) {
        const prompt = `Please respond in the same language as the following text. Summarize the following text:
\n${text}`;
        callOpenAI(prompt, summarizeBtn);
    } else {
        alert('Nothing to summarize.');
    }
});

exploreBtn.addEventListener('click', () => {
    const text = noteContent.value.trim();
    if (text) {
        const prompt = `Please respond in the same language as the following text. Based on the following text, suggest 3 related ideas or directions to explore further:\n\n${text}`;
        callOpenAI(prompt, exploreBtn);
    } else {
        alert('Nothing to explore.');
    }
});

pitchBtn.addEventListener('click', () => {
    const text = noteContent.value.trim();
    if (text) {
        const userName = localStorage.getItem('userName') || 'I';
        const prompt = `Please respond in the same language as the following text. Turn the following notes from ${userName} into a brief, compelling pitch or elevator statement:\n\n${text}`;
        callOpenAI(prompt, pitchBtn);
    } else {
        alert('Nothing to make a pitch from.');
    }
});

// --- Contextual Action Logic ---

async function getSuggestedAction(text) {
    if (!text || text.length < 50) { // Only suggest for longer texts
        contextualActionContainer.style.display = 'none';
        return;
    }

    const apiKey = getApiKey();
    if (!apiKey) return; // Stop if no key

    const prompt = `Given the following text, suggest ONE concise, actionable phrase (max 4 words, e.g., "Create Task List", "Draft Email Reply", "Find Synonyms", "Check Grammar") that could be performed on this text. Output ONLY the phrase.

Text:
"${text}"

Suggested action phrase:`;

    try {
        // Use a separate, silent fetch - don't show loading on the main button
        const response = await fetch(OPENAI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo', // Use a fast model
                messages: [
                    { role: 'system', content: 'You suggest short, actionable phrases based on input text.' },
                    { role: 'user', content: prompt }
                ],
                max_tokens: 15,
                temperature: 0.5 // Lower temperature for more predictable suggestions
            })
        });

        if (!response.ok) {
             console.warn('Failed to get suggested action:', response.status);
            contextualActionContainer.style.display = 'none';
            return;
        }

        const data = await response.json();
        let suggestedPhrase = data.choices[0]?.message?.content.trim().replace(/"/g, ''); // Remove quotes

        // Basic validation
        if (suggestedPhrase && suggestedPhrase.length > 0 && suggestedPhrase.length < 30) {
            contextualActionBtn.textContent = suggestedPhrase;
            contextualActionBtn.dataset.actionPhrase = suggestedPhrase; // Store for execution
            contextualActionContainer.style.display = 'block'; // Show the button
            console.log('Suggested action:', suggestedPhrase);
        } else {
            console.warn('Invalid or empty suggestion received:', suggestedPhrase);
            contextualActionContainer.style.display = 'none';
        }

    } catch (error) {
        console.error('Error getting suggested action:', error);
        contextualActionContainer.style.display = 'none'; // Hide on error
    }
}

async function executeContextualAction() {
    const actionPhrase = contextualActionBtn.dataset.actionPhrase;
    const text = noteContent.value.trim();

    if (!actionPhrase || !text) {
        alert("Cannot execute action: Missing context or text.");
        return;
    }

    const prompt = `Perform the following action: "${actionPhrase}" on the text below. Respond in the same language as the original text. Append the result clearly labeled under a heading like "--- ${actionPhrase} Result ---".

Text:
"${text}"`;

    // Use the existing callOpenAI, passing the contextual button
    callOpenAI(prompt, contextualActionBtn);
}

// Debounced check for suggestions on text input
noteContent.addEventListener('input', () => {
    checkTextArea(); // Update standard AI buttons immediately

    // Debounce suggestion fetching
    clearTimeout(suggestionTimeout);
    const currentText = noteContent.value.trim();
    if (currentText.length >= 50) { // Only schedule if text is long enough
        suggestionTimeout = setTimeout(() => {
            getSuggestedAction(currentText);
        }, SUGGESTION_DEBOUNCE_DELAY);
    } else {
         contextualActionContainer.style.display = 'none'; // Hide if text becomes too short
    }
});

// Listener for the contextual action button
contextualActionBtn.addEventListener('click', executeContextualAction);

// --- Initialization --- 

// Load notes and display
loadNotesFromStorage();

// Load the first note by default, or start a new one if none exist
if (notes.length > 0) {
    loadNote(notes[0].id);
} else {
    startNewNote();
}

contextualActionContainer.style.display = 'none'; // Ensure hidden on load 