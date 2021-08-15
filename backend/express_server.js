const express = require("express");
const amqp = require("amqplib/callback_api");
const Amadeus = require("amadeus");
const fs = require("fs");
const csv = require("csv-parser");
const readline = require("readline");
const { resolve } = require("path");

// const tools = require('./tools');

const app = express();
app.use(express.json());
app.listen(3333, () => console.log("Server started"));

const amadeus = new Amadeus({
	clientId: "GShykh1Kr4v6H8ArbLzCjFfJuu8EZVXB",
	clientSecret: "m84NSPakMMJVSVG3",
});

// let cheapestFlightDestinations = [
//   { destinationIata: "OPO", price: "49.76", currency: "EUR" },
//   { destinationIata: "PMI", price: "56.58", currency: "EUR" },
//   { destinationIata: "LIS", price: "57.42", currency: "EUR" },
//   { destinationIata: "BCN", price: "58.61", currency: "EUR" },
//   { destinationIata: "LGW", price: "65.27", currency: "EUR" },
//   { destinationIata: "ORY", price: "76.89", currency: "EUR" },
//   { destinationIata: "LPA", price: "84.98", currency: "EUR" },
//   { destinationIata: "AMS", price: "86.99", currency: "EUR" },
//   { destinationIata: "RAK", price: "88.67", currency: "EUR" },
//   { destinationIata: "MXP", price: "89.11", currency: "EUR" },
//   { destinationIata: "FCO", price: "95.91", currency: "EUR" },
//   { destinationIata: "MIA", price: "217.32", currency: "EUR" },
//   { destinationIata: "JFK", price: "240.50", currency: "EUR" },
//   { destinationIata: "CUN", price: "275.74", currency: "EUR" },
//   { destinationIata: "BKK", price: "400.01", currency: "EUR" },
//   { destinationIata: "LAX", price: "451.41", currency: "EUR" },
// ];
let cheapestFlightDestinations = [];
let locations = {};
// let originIATA;

const getCheapestFlightDestinations = async () => {
	try {
		console.log("making an api request...");
		const response = await amadeus.shopping.flightDestinations.get({
			origin: "MAD",
		});

		console.log("passou");

		const handledDestinations = await handleCheapestFlightDestinations(
			response
		);
		cheapestFlightDestinations = handledDestinations;
		console.log("the cheapest destinations to go to have been set!");
		console.log(cheapestFlightDestinations);
	} catch (err) {
		console.error(err);
	}
};

const handleCheapestFlightDestinations = (response) => {
	console.log("filtering the api response...");
	const { data, meta } = response.result;

	return data.map((item) => ({
		destinationIata: item.destination,
		price: item.price.total,
		currency: meta.currency,
	}));
};

const processLineByLine = async (path, lineCallback) => {
	const fileStream = fs.createReadStream(path);
	const rl = readline.createInterface({
		input: fileStream,
		crlfDelay: Infinity,
	});

	rl.on("line", await lineCallback);
};

const setDestinationCountryCode = () => {
	cheapestFlightDestinations = cheapestFlightDestinations.map(
		(destination) => ({
			...destination,
			countryCode: locations?.[destination.destinationIata]?.countryCode,
		})
	);
};

const sendRecommendationsToQueue = () => {
	cheapestFlightDestinations.forEach((destination) => {
		const bufferedMessage = Buffer.from(JSON.stringify(destination));
		queueRecommendation(bufferedMessage);
	});
};

const queueRecommendation = (msg) => {
	amqp.connect("amqp://localhost", function (error0, connection) {
		if (error0) {
			throw error0;
		}
		connection.createChannel(function (error1, channel) {
			if (error1) {
				throw error1;
			}

			let queue = "travel_recommendation_queue";

			channel.assertQueue(queue, {
				durable: true,
			});
			channel.sendToQueue(queue, Buffer.from(msg), {
				persistent: true,
			});
			console.log(" [x] Sent '%s' to '%s'", msg, queue);
		});

		setTimeout(function () {
			connection.close();
		}, 500);
	});
};

const Main = async () => {
	try {
		await processLineByLine("./airports.csv", (line) => {
			if (line?.iata_code) {
				location[line?.iata_code] = {
					countryCode: line.iso_country,
					municipality: line.municipality,
				};
			}
		});
		await getCheapestFlightDestinations();
		if (cheapestFlightDestinations.length && locations.length) {
			setDestinationCountryCode();
			sendRecommendationsToQueue();
		}
	} catch (err) {
		console.error(err);
	}
};

Main();
