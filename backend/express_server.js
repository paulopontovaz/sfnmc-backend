const express = require('express');
const amqp = require('amqplib/callback_api');
const Amadeus = require('amadeus');
const fs = require('fs');
const csv = require('csv-parser');
// const tools = require('./tools');

const app = express();
app.use(express.json());
app.listen(3333, () => console.log('Server started'));

const amadeus = new Amadeus({
  clientId: 'GShykh1Kr4v6H8ArbLzCjFfJuu8EZVXB',
  clientSecret: 'm84NSPakMMJVSVG3'
});

let cheapestFlightDestinations = [];
let locations = [];
let originIATA;

const getCheapestFlightDestinations = async () => {
  try {
    console.log('making an api request...');
    const response = await amadeus.shopping.flightDestinations.get({
      origin: 'MUC' || originIATA
    });

    const handledDestinations = await handleCheapestFlightDestinations(response);
    cheapestFlightDestinations = handledDestinations;
    console.log('the cheapest destinations to go to have been set!');

  } catch (err) {
    console.error(err);
  }

}

const handleCheapestFlightDestinations = response => {
  console.log('filtering the api response...');
  const { data, meta } = response.result;

  return data.map(item => ({
    destinationIata: item.destination,
    price: item.price.total,
    currency: meta.currency,
  }))
}

const readCsvFile = async () => {
  console.log('reading data from the csv file...');
  fs.createReadStream('./airports.csv')
    .pipe(csv())
    .on('data', (row) => {
      if (row.iata_code !== '') {
        const locationInfo = {
          country: row.iso_country,
          iataCode: row.iata_code,
          municipality: row.municipality
        };
        locations.push(locationInfo);
      }
    })
    .on('end', function () {
      console.log('the csv file has been read and set as an array!');
    })
}

const setDestinationCountryCode = () => {
  cheapestFlightDestinations.forEach(destination => {
    locations.forEach(location => {
      if (location.iataCode === destination.destinationIata) {
        const index = cheapestFlightDestinations.indexOf(destination);
        cheapestFlightDestinations[index]= {
          destinationIata: destination.destinationIata, 
          countryCode: location.country,
          flightPrice: destination.price,
          currency: destination.currency
        }
      }
    })
  })
}

const sendRecommendationsToQueue = () => {
  cheapestFlightDestinations.forEach(destination => {
    const bufferedMessage = Buffer.from(JSON.stringify(destination));
    queueRecommendation(bufferedMessage);
  });
}

const queueRecommendation = (msg) => {
  amqp.connect('amqp://localhost', function (error0, connection) {
    if (error0) {
      throw error0;
    }
    connection.createChannel(function (error1, channel) {
      if (error1) {
        throw error1;
      }

      let queue = 'travel_recommendation_queue';

      channel.assertQueue(queue, {
        durable: true
      });
      channel.sendToQueue(queue, Buffer.from(msg), {
        persistent: true
      });
      console.log(" [x] Sent '%s' to '%s'", msg, queue);
    });

    setTimeout(function () {
      connection.close();
    }, 500);
  });
}

const Main = async () => {
  await readCsvFile();
  await getCheapestFlightDestinations();
  if (cheapestFlightDestinations !== [] && locations !== []) {
    setDestinationCountryCode();
    // console.log('THE FINAL LIST: ', cheapestFlightDestinations);
    sendRecommendationsToQueue();
  }
}

Main();






