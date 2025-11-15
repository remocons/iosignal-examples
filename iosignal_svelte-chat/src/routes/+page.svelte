<script>
  import { dev, browser } from "$app/environment";
  import IO from "iosignal/io.js";

  // const url = 'ws://192.168.0.15:7777';
  // const url = "wss://io.iosignal.net/ws";
  const url = "ws://localhost:7777";
  const channel_tag = "openchat";

  let messages = $state([]);
  let input = $state("Hello, World!");
  let ioState = $state(null);
  let cid = $state(null);
  let counts = $state({ instances: 0, websockets: 0 });
  let io = null;
  let messagesEnd;

  const scrollToBottom = () => {
    messagesEnd?.scrollIntoView({ behavior: "smooth" });
  };

  if (browser) {

    io = new IO(url);
    if (dev)
      console.log("new io:", IO.version, IO.instanceCount, IO.webSocketCount);

    counts = { instances: IO.instanceCount, websockets: IO.webSocketCount };

    const handleReady = () => {
      console.log("ready cid:", io.cid);
      cid = io.cid;
      io.subscribe(channel_tag);
    };

    const handleChange = (state) => {
      ioState = state;
      counts = { instances: IO.instanceCount, websockets: IO.webSocketCount };
    };

    const handleChannelMessage = (tag, msgObj ) => {
      if( tag == channel_tag ){
        messages = [...messages, `${msgObj.cid} : ${msgObj.text}`];
        scrollToBottom();
      }
    };

    const handleError = (error) => {
      console.error("IO Error in App:", error);
      ioState = `Error: ${error.message}`;
    };

    io.on("ready", handleReady);
    io.on("change", handleChange);
    io.on("message", handleChannelMessage);
    io.on("error", handleError);

    $effect(() => {
      return () => {
        io.destroy();
        io = null;
      };
    });
  }

  const sendMessage = () => {
    if (input.trim()) {
      const msgObj = { text: input, cid: io.cid };
      io.signal(channel_tag, msgObj);
      input = ''
    }
  };

  let ioStateStyle = $derived(
    `color: ${ioState === "ready" ? "green" : "red"}; font-weight: bold;`,
  );
</script>

<div class="App">
  <h1>IOSignal Svelte 5 Chat Example</h1>
  <div>URL: {url}</div>
  <div>Channel: {channel_tag}</div>
  <div>IO State: <span style={ioStateStyle}>{ioState}</span></div>
  <div>Client ID: {cid}</div>
  <div>IO Instances: {counts.instances}</div>
  <div>WebSockets Created: {counts.websockets}</div>
  <div class="messages">
    {#each messages as msg, index (index)}
      <div>{msg}</div>
    {/each}
    <div bind:this={messagesEnd}></div>
  </div>
  <div class="input-area">
    <input
      type="text"
      bind:value={input}
      onkeyup={(e) => e.key === "Enter" && sendMessage()}
      disabled={ioState !== "ready"}
    />
    <button onclick={sendMessage} disabled={ioState !== "ready"}> Send </button>
  </div>
</div>

<style>
  .App {
    height: 100%;
    margin: 0;
    display: flex;
    flex-direction: column;
    padding: 20px;
    box-sizing: border-box;
  }

  h1 {
    margin-top: 0;
    color: #333;
  }

  .messages {
    flex-grow: 1;
    border: 1px solid #ccc;
    padding: 10px;
    overflow-y: auto;
    margin-bottom: 10px;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }

  .messages div {
    background-color: #f0f0f0;
    padding: 8px;
    margin-bottom: 5px;
    border-radius: 5px;
    text-align: left;
  }

  .input-area {
    display: flex;
    gap: 10px;
    margin-top: auto;
  }

  .input-area input {
    flex-grow: 1;
    padding: 10px;
    border: 1px solid #ccc;
    border-radius: 5px;
  }

  .input-area button {
    padding: 10px 15px;
    background-color: #007bff;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
  }

  .input-area button:hover {
    background-color: #0056b3;
  }
</style>
