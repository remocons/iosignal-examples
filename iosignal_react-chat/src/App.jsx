import { useState, useEffect, useRef } from 'react';
import './App.css';
import IO from 'iosignal/io.js';

// const url = 'wss://io.iosignal.net/ws';
const url = 'ws://localhost:7777';
const channel_tag = 'openchat';

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('Hello, World!');
  const [ioState, setIoState] = useState(null); // ioState is updated by io.on('change')
  const [cid, setCid] = useState(null);       // cid is updated by io.on('ready')
  const [counts, setCounts] = useState({ instances: 0, websockets: 0 }); // State for IO counts
  const ioRef = useRef(null); // Manage io instance with useRef
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    console.log(IO.version)
    ioRef.current = new IO(url); // Create io instance with URL
    setCounts({ instances: IO.instanceCount, websockets: IO.webSocketCount }); // Set initial counts

    if (!ioRef.current) {
      console.error('IO instance is not initialized.');
      return;
    }

    const handleReady = () => {
      console.log('ready cid:', ioRef.current.cid);
      setCid(ioRef.current.cid); // Update cid state
      ioRef.current.subscribe(channel_tag); // Subscribe to channel
    };

    const handleChange = (state) => {
      setIoState(state);
      setCounts({ instances: IO.instanceCount, websockets: IO.webSocketCount }); // Update counts on state change
    };

    const handleChannelMessage = (tag, msgObj ) => {
      if( typeof msgObj === 'string' ) {
        msgObj = { text: msgObj, cid: 'cid unknown' }; // Convert string to object if necessary
      }
      setMessages((prevMessages) => [...prevMessages, `${msgObj.cid} : ${msgObj.text}`]); // Update messages state]);
    };

    const handleError = (error) => {
      console.error('IO Error in App:', error);
      setIoState(`Error: ${error.message}`);
    };

    ioRef.current.on('ready', handleReady);
    ioRef.current.on('change', handleChange);
    ioRef.current.on(channel_tag, handleChannelMessage); // Add channel message listener
    ioRef.current.on('error', handleError);


    // Cleanup function: remove event listeners when component unmounts
    return () => {
      ioRef.current.off('ready', handleReady);
      ioRef.current.off('change', handleChange);
      ioRef.current.off(channel_tag, handleChannelMessage);
      ioRef.current.off('error', handleError);
 
      // destroy() is called to clean up the io instance, all listeners are removed automatically
      ioRef.current.destroy(); // Clean up the io instance
      console.log('IO instance destroyed.');
      ioRef.current = null; // Release the io instance reference
    };
  }, []); // Empty dependency array ensures this runs only once on mount

  const sendMessage = () => {
    if (input.trim()) {
      const msgObj = { text: input, cid: ioRef.current.cid };
      // console.log('Sending message object:', msgObj);
      ioRef.current.signal(channel_tag, msgObj); // Send message to channel
      setInput('');
    }
  };

  const ioStateStyle = {
    color: ioState === 'ready' ? 'green' : 'red',
    fontWeight: 'bold',
  };

  return (
    <div className="App">
      <h1>IOSignal React Chat Example</h1>
      <div>URL: {url}</div>
      <div>Channel: {channel_tag}</div>
      <div>IO State: <span style={ioStateStyle}>{ioState}</span></div>
      <div>Client ID: {cid}</div>
      <div>IO Instances: {counts.instances}</div>
      <div>WebSockets Created: {counts.websockets}</div>
      <div className="messages">
        {messages.map((msg, index) => (
          <div key={index}>{msg}</div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="input-area">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyUp={(e) => e.key === 'Enter' && sendMessage()}
          disabled={ioState !== 'ready'}
        />
        <button onClick={sendMessage} disabled={ioState !== 'ready'}>
          Send
        </button>
      </div>
    </div>
  );
}

export default App;
