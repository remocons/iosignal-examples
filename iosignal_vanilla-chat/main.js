import IO from 'iosignal/browser/esm/io.js';

// A build can choose another server: VITE_SIGNAL_URL=wss://io.iosignal.net/ws npm run build
const url = import.meta.env.VITE_SIGNAL_URL || 'ws://localhost:7779';
const channel_tag = 'openchat';
// A site build can link back to its example list: VITE_HOME_URL=https://lab.iosignal.net/ npm run build
const homeUrl = import.meta.env?.VITE_HOME_URL;

const urlDisplay = document.getElementById('url');
const channelDisplay = document.getElementById('channel');
const ioStateDisplay = document.getElementById('io-state');
const cidDisplay = document.getElementById('cid');
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('input');
const sendButton = document.getElementById('send-button');
messageInput.value = 'Hello, World';

let io = null;

const setReady = (ready) => {
    sendButton.disabled = !ready;
    messageInput.disabled = !ready;
};

const handleReady = () => {
    cidDisplay.textContent = io.cid;
    io.subscribe(channel_tag); // A manual subscription lasts for one connection: repeat it on every ready.
};

const handleChange = (state) => {
    ioStateDisplay.textContent = state;
    ioStateDisplay.style.color = state === 'ready' ? 'green' : 'red';
    setReady(state === 'ready');
};

// msg.cid is written by the sender, not checked by the server.
const handleChannelMessage = (tag, msg) => {
    if (tag !== channel_tag || !msg) return;
    // A plain string (for example from a CLI) has no sender field.
    const { cid = '?', text = msg } = typeof msg === 'string' ? {} : msg;
    const messageElement = document.createElement('div');
    messageElement.textContent = `${cid} : ${text}`;
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
};

const handleError = (error) => {
    ioStateDisplay.textContent = `Error: ${error.message}`;
    ioStateDisplay.style.color = 'red';
    setReady(false);
};

const sendMessage = () => {
    const text = messageInput.value.trim();
    if (text && io?.stateName === 'ready') {
        io.signal(channel_tag, { text, cid: io.cid });
        messageInput.value = '';
    }
};

const handleKeyUp = (event) => {
    if (event.key === 'Enter') sendMessage();
};

function initialize() {
    if (homeUrl) {
        const homeLink = document.getElementById('home-link');
        homeLink.href = homeUrl;
        homeLink.hidden = false;
    }
    urlDisplay.textContent = url;
    channelDisplay.textContent = channel_tag;
    io = new IO();
    io.on('ready', handleReady);
    io.on('change', handleChange);
    io.on('message', handleChannelMessage);
    io.on('error', handleError);
    io.open(url);
    sendButton.addEventListener('click', sendMessage);
    messageInput.addEventListener('keyup', handleKeyUp);
}

function cleanup() {
    sendButton.removeEventListener('click', sendMessage);
    messageInput.removeEventListener('keyup', handleKeyUp);
    io?.destroy(); // destroy() also removes the IO event listeners.
    io = null;
}

// Module scripts normally run after the DOM is parsed; HMR can run later.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
} else {
    initialize();
}
window.addEventListener('beforeunload', cleanup, { once: true });
if (import.meta.hot) import.meta.hot.dispose(cleanup);
