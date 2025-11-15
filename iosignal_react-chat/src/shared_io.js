import IO from 'iosignal/io.js'


const url = 'ws://localhost:7777';
const io = new IO(url);
const channel = 'chat';


console.log('IO instance created:', io);

export { io, channel};

