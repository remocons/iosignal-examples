<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue';
import IO from 'iosignal/browser/esm/io.js';

// A build can choose another server: VITE_SIGNAL_URL=wss://io.iosignal.net/ws npm run build
const url = import.meta.env.VITE_SIGNAL_URL || 'ws://localhost:7782';
const channel_tag = 'openchat';

const messages = ref([]);
const input = ref('Hello, World!');
const ioState = ref(null);
const cid = ref(null);
const messagesEnd = ref(null);
const ready = computed(() => ioState.value === 'ready');
let io = null;
let nextId = 0;

// This component owns its IO: create it on mount and destroy it on unmount.
onMounted(() => {
  io = new IO();

  io.on('ready', () => {
    cid.value = io.cid;
    io.subscribe(channel_tag); // A manual subscription lasts for one connection: repeat it on every ready.
  });
  io.on('change', (state) => (ioState.value = state));
  // msg.cid is written by the sender, not checked by the server.
  io.on('message', async (tag, msg) => {
    if (tag !== channel_tag || !msg) return;
    // A plain string (for example from a CLI) has no sender field.
    const { cid = '?', text = msg } = typeof msg === 'string' ? {} : msg;
    messages.value.push({ id: nextId++, cid, text });
    await nextTick();
    messagesEnd.value?.scrollIntoView({ behavior: 'smooth' });
  });
  io.on('error', (error) => (ioState.value = `Error: ${error.message}`));
  io.open(url);
});

onBeforeUnmount(() => {
  io?.destroy(); // destroy() also removes the IO event listeners.
  io = null;
});

const sendMessage = () => {
  const text = input.value.trim();
  if (text && io?.stateName === 'ready') {
    io.signal(channel_tag, { text, cid: io.cid });
    input.value = '';
  }
};
</script>

<template>
  <div class="App">
    <h1>IOSignal Vue Chat Example</h1>
    <div>URL: {{ url }}</div>
    <div>Channel: {{ channel_tag }}</div>
    <div>IO State: <span :style="{ color: ready ? 'green' : 'red', fontWeight: 'bold' }" role="status">{{ ioState }}</span></div>
    <div>Client ID: {{ cid }}</div>
    <div class="messages" role="log" aria-label="Chat messages" tabindex="0">
      <div v-for="msg in messages" :key="msg.id">{{ msg.cid }} : {{ msg.text }}</div>
      <div ref="messagesEnd" aria-hidden="true"></div>
    </div>
    <div class="input-area">
      <input
        v-model="input"
        aria-label="Message"
        type="text"
        :disabled="!ready"
        @keyup.enter="sendMessage"
      />
      <button :disabled="!ready" @click="sendMessage">Send</button>
    </div>
  </div>
</template>
