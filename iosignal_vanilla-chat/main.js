import IO from 'iosignal/io.js';

const url = 'ws://localhost:7777';
// const url = 'wss://io.iosignal.net/ws';
const channel_tag = 'openchat';

// Get DOM elements
const urlDisplay = document.getElementById('url');
const channelDisplay = document.getElementById('channel');
const ioStateDisplay = document.getElementById('io-state');
const cidDisplay = document.getElementById('cid');
const instancesDisplay = document.getElementById('io-instances');
const websocketsDisplay = document.getElementById('ws-created');
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('input');
const sendButton = document.getElementById('send-button');
messageInput.value = 'Hello, World';

let io = null;

const scrollToBottom = () => {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
};

const updateIoCounts = () => {
    instancesDisplay.textContent = IO.instanceCount;
    websocketsDisplay.textContent = IO.webSocketCount;
};

const handleReady = () => {
    console.log('ready cid:', io.cid);
    cidDisplay.textContent = io.cid;
    io.subscribe(channel_tag);
    ioStateDisplay.textContent = 'ready';
    ioStateDisplay.style.color = 'green';
    sendButton.disabled = false;
    messageInput.disabled = false;
    updateIoCounts();
};

const handleChange = (state) => {
    console.log('IO state changed to:', state);
    ioStateDisplay.textContent = state;
    ioStateDisplay.style.color = state === 'ready' ? 'green' : 'red';
    sendButton.disabled = state !== 'ready';
    messageInput.disabled = state !== 'ready';
    updateIoCounts();
};

const handleChannelMessage = (tag, msgObj) => {
    if( tag == channel_tag && msgObj){
        if (typeof msgObj === 'string') {
            msgObj = { text: msgObj, cid: 'cid unknown' };
        }
        const messageElement = document.createElement('div');
        messageElement.textContent = `${msgObj.cid} : ${msgObj.text}`;
        messagesContainer.appendChild(messageElement);
        scrollToBottom();
    }
};

const handleError = (error) => {
    console.error('IO Error:', error);
    ioStateDisplay.textContent = `Error: ${error.message}`;
    ioStateDisplay.style.color = 'red';
    sendButton.disabled = true;
    messageInput.disabled = true;
};

const sendMessage = () => {
    const inputText = messageInput.value.trim();
    if (inputText && io && io.cid) {
        const msgObj = { text: inputText, cid: io.cid };
        io.signal(channel_tag, msgObj);
        messageInput.value = '';
    }
};

// Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    urlDisplay.textContent = url;
    channelDisplay.textContent = channel_tag;

    io = new IO(url);
    console.log('IO instance created:', IO.version, IO.instanceCount, IO.webSocketCount);
    updateIoCounts();

    io.on('ready', handleReady);
    io.on('change', handleChange);
    io.on('message', handleChannelMessage);
    io.on('error', handleError);

    sendButton.addEventListener('click', sendMessage);
    messageInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        if (io) {
            io.destroy();
            console.log('IO instance destroyed.');
            io = null;
        }
    });
});
