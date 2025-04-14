const settingsBtn = document.getElementById('settings-btn');
const dictateBtn = document.getElementById('dictate-btn');
const summarizeBtn = document.getElementById('summarize-btn');
const exploreBtn = document.getElementById('explore-btn');
const pitchBtn = document.getElementById('pitch-btn');
const noteContent = document.getElementById('note-content');
const noteList = document.getElementById('note-list');
const newNoteBtn = document.getElementById('new-note-btn');
const saveNoteBtn = document.getElementById('save-note-btn');
// const noteTitleInput = document.getElementById('note-title'); // If using title input

// --- State --- 
let currentNoteId = null;
let notes = []; // In-memory store of notes

// --- MediaRecorder and Whisper Integration ---
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
const OPENAI_AUDIO_API_URL = 'https://api.openai.com/v1/audio/transcriptions';

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        let options = { mimeType: 'audio/wav' };
        try {
            // Attempt 1: WAV
            mediaRecorder = new MediaRecorder(stream, options);
            console.log('Using mimeType:', options.mimeType);
        } catch (e1) {
            console.warn(`mimeType ${options.mimeType} not supported. Trying Ogg/Opus...`);
            options = { mimeType: 'audio/ogg; codecs=opus' };
            try {
                 // Attempt 2: Ogg/Opus
                mediaRecorder = new MediaRecorder(stream, options);
                console.log('Using mimeType:', options.mimeType);
            } catch (e2) {
                console.warn(`mimeType ${options.mimeType} not supported. Falling back to default.`);
                 // Attempt 3: Default
                mediaRecorder = new MediaRecorder(stream);
                console.log('Using default mimeType:', mediaRecorder.mimeType);
            }
        }

        audioChunks = []; // Reset chunks

        mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            const mimeType = mediaRecorder.mimeType || 'audio/wav'; // Prioritize actual, fallback to wav
            let fileExtension = 'bin'; // Default extension
            if (mimeType.includes('wav')) {
                fileExtension = 'wav';
            } else if (mimeType.includes('ogg')) {
                fileExtension = 'ogg';
            } else if (mimeType.includes('webm')) {
                fileExtension = 'webm';
            }
            // Add more types if needed (mp3, mp4, etc.)

            const fileName = `recording.${fileExtension}`;
            console.log(`Creating Blob with type: ${mimeType}, filename: ${fileName}`);

            const audioBlob = new Blob(audioChunks, { type: mimeType });
            // Stop the tracks
            stream.getTracks().forEach(track => track.stop());
            // Send to Whisper API
            await transcribeAudio(audioBlob, dictateBtn, fileName); // Pass filename
            // Reset UI after transcription attempt
            isRecording = false;
            dictateBtn.textContent = 'Start Dictation';
            dictateBtn.disabled = false;
        };

        mediaRecorder.start();
        isRecording = true;
        dictateBtn.textContent = 'Stop Dictation';
        dictateBtn.disabled = false; // Ensure it's enabled
        console.log('Recording started...');

    } catch (err) {
        console.error('Error accessing microphone:', err);
        alert('Could not access microphone. Please ensure permission is granted.');
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
        const prompt = `Please summarize the following text:
\n${text}`;
        callOpenAI(prompt, summarizeBtn);
    } else {
        alert('Nothing to summarize.');
    }
});

exploreBtn.addEventListener('click', () => {
    const text = noteContent.value.trim();
    if (text) {
        const prompt = `Based on the following text, suggest 3 related ideas or directions to explore further:\n\n${text}`;
        callOpenAI(prompt, exploreBtn);
    } else {
        alert('Nothing to explore.');
    }
});

pitchBtn.addEventListener('click', () => {
    const text = noteContent.value.trim();
    if (text) {
        const userName = localStorage.getItem('userName') || 'I'; // Use saved name or default
        const prompt = `Turn the following notes from ${userName} into a brief, compelling pitch or elevator statement:\n\n${text}`;
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
        // Update active state in sidebar
        renderNoteList();
        checkTextArea(); // Update AI button state
        console.log(`Loaded note: ${noteToLoad.title} (ID: ${noteId})`);
    } else {
        console.error('Note not found:', noteId);
        startNewNote(); // Fallback to a new note if ID is invalid
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
}

// --- Event Listeners --- 

saveNoteBtn.addEventListener('click', saveCurrentNote);

newNoteBtn.addEventListener('click', startNewNote);

summarizeBtn.addEventListener('click', () => {
    const text = noteContent.value.trim();
    if (text) {
        const prompt = `Please summarize the following text:\n\n${text}`;
        callOpenAI(prompt, summarizeBtn); // Existing function
    } else {
        alert('Nothing to summarize.');
    }
});

exploreBtn.addEventListener('click', () => {
    const text = noteContent.value.trim();
    if (text) {
        const prompt = `Based on the following text, suggest 3 related ideas or directions to explore further:\n\n${text}`;
        callOpenAI(prompt, exploreBtn); // Existing function
    } else {
        alert('Nothing to explore.');
    }
});

pitchBtn.addEventListener('click', () => {
    const text = noteContent.value.trim();
    if (text) {
        const userName = localStorage.getItem('userName') || 'I';
        const prompt = `Turn the following notes from ${userName} into a brief, compelling pitch or elevator statement:\n\n${text}`;
        callOpenAI(prompt, pitchBtn); // Existing function
    } else {
        alert('Nothing to make a pitch from.');
    }
});

// --- Initialization --- 

// Load notes and display
loadNotesFromStorage();

// Load the first note by default, or start a new one if none exist
if (notes.length > 0) {
    loadNote(notes[0].id);
} else {
    startNewNote();
} 