import { useState, useEffect, useRef } from 'react';
import './App.css';
import IO from 'iosignal/browser/esm/io.js';

// A build can choose another server: VITE_SIGNAL_URL=wss://io.iosignal.net/ws npm run build
const url = import.meta.env.VITE_SIGNAL_URL || 'ws://localhost:7777';
const channel_tag = 'openchat';

let nextId = 0;

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('Hello, World!');
  const [ioState, setIoState] = useState(null);
  const [cid, setCid] = useState(null);
  const ioRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // This component owns its IO: create it on mount and destroy it on unmount
  // (StrictMode mounts twice in development, so each mount gets its own IO).
  useEffect(() => {
    const io = new IO();
    ioRef.current = io;

    io.on('ready', () => {
      setCid(io.cid);
      io.subscribe(channel_tag); // A manual subscription lasts for one connection: repeat it on every ready.
    });
    io.on('change', setIoState);
    // msg.cid is written by the sender, not checked by the server.
    io.on('message', (tag, msg) => {
      if (tag !== channel_tag || !msg) return;
      // A plain string (for example from a CLI) has no sender field.
      const { cid = '?', text = msg } = typeof msg === 'string' ? {} : msg;
      setMessages((prev) => [...prev, { id: nextId++, cid, text }]);
    });
    io.on('error', (error) => setIoState(`Error: ${error.message}`));
    io.open(url);

    return () => {
      io.destroy(); // destroy() also removes the IO event listeners.
      ioRef.current = null;
    };
  }, []);

  const sendMessage = () => {
    const io = ioRef.current;
    const text = input.trim();
    if (text && io?.stateName === 'ready') {
      io.signal(channel_tag, { text, cid: io.cid });
      setInput('');
    }
  };

  const ready = ioState === 'ready';

  return (
    <div className="App">
      <h1>IOSignal React Chat Example</h1>
      <div>URL: {url}</div>
      <div>Channel: {channel_tag}</div>
      <div>IO State: <span style={{ color: ready ? 'green' : 'red', fontWeight: 'bold' }} role="status">{ioState}</span></div>
      <div>Client ID: {cid}</div>
      <div className="messages" role="log" aria-label="Chat messages" tabIndex={0}>
        {messages.map((msg) => (
          <div key={msg.id}>{msg.cid} : {msg.text}</div>
        ))}
        <div ref={messagesEndRef} aria-hidden="true" />
      </div>
      <div className="input-area">
        <input
          aria-label="Message"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyUp={(e) => e.key === 'Enter' && sendMessage()}
          disabled={!ready}
        />
        <button onClick={sendMessage} disabled={!ready}>
          Send
        </button>
      </div>
    </div>
  );
}

export default App;
