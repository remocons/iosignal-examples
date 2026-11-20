<script>
  import { onMount, tick } from "svelte";
  import IO from "iosignal/browser/esm/io.js";

  // A build can choose another server: VITE_SIGNAL_URL=wss://io.iosignal.net/ws npm run build
  const url = import.meta.env.VITE_SIGNAL_URL || "ws://localhost:7778";
  const channel_tag = "openchat";

  let messages = $state([]);
  let input = $state("Hello, World!");
  let ioState = $state(null);
  let cid = $state(null);
  let io = null;
  let messagesEnd;
  let nextId = 0;

  // This page owns its IO: create it on mount and destroy it on unmount.
  onMount(() => {
    io = new IO();

    io.on("ready", () => {
      cid = io.cid;
      io.subscribe(channel_tag); // A manual subscription lasts for one connection: repeat it on every ready.
    });
    io.on("change", (state) => (ioState = state));
    // msg.cid is written by the sender, not checked by the server.
    io.on("message", async (tag, msg) => {
      if (tag !== channel_tag || !msg) return;
      // A plain string (for example from a CLI) has no sender field.
      const { cid = "?", text = msg } = typeof msg === "string" ? {} : msg;
      messages.push({ id: nextId++, cid, text });
      await tick();
      messagesEnd?.scrollIntoView({ behavior: "smooth" });
    });
    io.on("error", (error) => (ioState = `Error: ${error.message}`));
    io.open(url);

    return () => {
      io.destroy(); // destroy() also removes the IO event listeners.
      io = null;
    };
  });

  const sendMessage = () => {
    const text = input.trim();
    if (text && io?.stateName === "ready") {
      io.signal(channel_tag, { text, cid: io.cid });
      input = "";
    }
  };

  let ready = $derived(ioState === "ready");
</script>

<svelte:head><title>IOSignal Svelte Chat</title></svelte:head>

<div class="App">
  <h1>IOSignal Svelte 5 Chat Example</h1>
  <div>URL: {url}</div>
  <div>Channel: {channel_tag}</div>
  <div>IO State: <span style="color: {ready ? 'green' : 'red'}; font-weight: bold;" role="status">{ioState}</span></div>
  <div>Client ID: {cid}</div>
  <div class="messages" role="log" aria-label="Chat messages">
    {#each messages as msg (msg.id)}
      <div>{msg.cid} : {msg.text}</div>
    {/each}
    <div bind:this={messagesEnd} aria-hidden="true"></div>
  </div>
  <div class="input-area">
    <input
      aria-label="Message"
      type="text"
      bind:value={input}
      onkeyup={(e) => e.key === "Enter" && sendMessage()}
      disabled={!ready}
    />
    <button onclick={sendMessage} disabled={!ready}> Send </button>
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
    flex: 1 1 0;
    min-height: 0;
    overflow-wrap: anywhere;
    border: 1px solid #ccc;
    padding: 10px;
    overflow-y: auto;
    margin-bottom: 10px;
    justify-content: flex-end;
  }

  .messages > div:not([aria-hidden]) {
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
    min-width: 0;
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
