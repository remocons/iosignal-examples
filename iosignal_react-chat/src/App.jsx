import { useState, useEffect, useRef } from 'react';
import './App.css';
import IO from 'iosignal/browser/esm/io.js';

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
    const io = new IO();
    ioRef.current = io;
    setCounts({ instances: IO.instanceCount, websockets: IO.webSocketCount });

    const handleReady = () => {
      console.log('ready cid:', io.cid);
      setCid(io.cid); // Update cid state
      io.subscribe(channel_tag); // Subscribe to channel
    };

    const handleChange = (state) => {
      setIoState(state);
      setCounts({ instances: IO.instanceCount, websockets: IO.webSocketCount }); // Update counts on state change
    };

    const handleChannelMessage = (tag, msgObj ) => {
      if(tag == channel_tag && msgObj){
        if( typeof msgObj === 'string' ) {
          msgObj = { text: msgObj, cid: 'cid unknown' }; // Convert string to object if necessary
        }
        setMessages((prevMessages) => [...prevMessages, `${msgObj.cid} : ${msgObj.text}`]); // Update messages state]);
      }
    };

    const handleError = (error) => {
      console.error('IO Error in App:', error);
      setIoState(`Error: ${error.message}`);
    };

    io.on('ready', handleReady);
    io.on('change', handleChange);
    io.on('message', handleChannelMessage);
    io.on('error', handleError);
    io.open(url);


    // Cleanup function: remove event listeners when component unmounts
    return () => {
      io.off('ready', handleReady);
      io.off('change', handleChange);
      io.off('message', handleChannelMessage);
      io.off('error', handleError);
 
      // destroy() is called to clean up the io instance, all listeners are removed automatically
      io.destroy(); // Clean up the io instance
      console.log('IO instance destroyed.');
      ioRef.current = null; // Release the io instance reference
    };
  }, []); // Empty dependency array ensures this runs only once on mount

  const sendMessage = () => {
    if (input.trim() && ioRef.current?.stateName === 'ready') {
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
      <div>IO State: <span style={ioStateStyle} role="status">{ioState}</span></div>
      <div>Client ID: {cid}</div>
      <div>IO Instances: {counts.instances}</div>
      <div>WebSockets Created: {counts.websockets}</div>
      <div className="messages" role="log" aria-label="Chat messages" tabIndex={0}>
        {messages.map((msg, index) => (
          <div key={index}>{msg}</div>
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
