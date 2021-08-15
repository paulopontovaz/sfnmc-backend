require('dotenv').config()

const envVariables = process.env;
const { AMADEUS_CLIENT_ID, AMADEUS_CLIENT_SECRET, PORT } = envVariables;

const express = require("express");
const amqp = require("amqplib/callback_api");
const Amadeus = require("amadeus");
const fs = require("fs");
const readline = require("readline");
const app = express();

app.use(express.json());
app.listen(PORT, () => console.log("Server started at %s", PORT));

const amadeus = new Amadeus({
	clientId: AMADEUS_CLIENT_ID,
	clientSecret: AMADEUS_CLIENT_SECRET,
});

let cheapestFlightDestinations = [];
let locations = {};

const getCheapestFlightDestinations = async () => {
	try {
		console.log("Making an api request...");
		
		const response = await amadeus.shopping.flightDestinations.get({
			origin: "MAD",
		});

		const handledDestinations = await handleCheapestFlightDestinations(
			response
		);

		cheapestFlightDestinations = handledDestinations;
		console.log("The cheapest destinations array have been set!");
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

const sendFlightRecommendation = async () => {
	await getCheapestFlightDestinations();
	
	if (cheapestFlightDestinations.length && Object.keys(locations).length) {
		setDestinationCountryCode();
		sendRecommendationsToQueue();
	}
}

const Main = async () => {
	try {
		await processLineByLine("./airports.csv", (line) => {
			const [name, iso_country,municipality,iata_code] = line.split(",")
			if (iata_code) {
				locations[iata_code] = {
					countryCode: iso_country,
					municipality: municipality,
				};
			}
		});

		var interval = setInterval( async function() {
			await sendFlightRecommendation()
		},15000);

	} catch (err) {
		console.error(err.statusCode);
	}
};

Main();
