const WebSocket = require('ws');

const connection = new WebSocket('ws://localhost:5000');
connection.binaryType = "arraybuffer";

connection.onopen = () => {
  console.log('Connected with server');
  connection.send('Hi, I am connected to you now hihi');
}

connection.onclose = () => {
  console.log('Connection ended.');
}

connection.onmessage = ({ data }) => {
  const converter = new TextDecoder("utf-8");
  const convertedData = converter.decode(data);
  console.log(convertedData);
}