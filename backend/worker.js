const WebSocket = require('ws');
let amqp = require('amqplib/callback_api');


const port = 5000;
const wss = new WebSocket.Server({ port });

let messages = [];
let myChannel;

wss.on('connection', function connection(ws) {
  ws.on('error', console.error);
  
  ws.on('message', function incoming(data) {
     console.log(data.toString());
    // for(let i = 0; i < messages.length; i++) {
    //   if (Buffer.compare(messages[i].content, data) == 0) {
    //     myChannel.ack(messages[i]);
    //     messages.splice(i, 1);
    //     console.log("Pedido autorizado.");
    //     break;
    //   }
    // }
  });
})


amqp.connect('amqp://localhost', (error0, connection) => {
  if (error0) {
    throw error0;
  }
  connection.createChannel((error1, channel) => {
    if (error1) {
      throw error1;
    }

    // myChannel = channel;
    let queue = 'travel_recommendation_queue';

    channel.assertQueue(queue, {
      durable: true
    });

    console.log(" [*] Waiting for messages in %s. To exit press CTRL+C", queue);
    
    channel.consume(queue, msg => {
      //messages.push(msg);
      console.log(" [x] Received %s", msg.content.toString());

      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(msg.content);
        }
      })
    }, {
      noAck: true
    });
  });
});
