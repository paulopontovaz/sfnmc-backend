require("dotenv").config();

const envVariables = process.env;
const { AMADEUS_CLIENT_ID, AMADEUS_CLIENT_SECRET, PORT } = envVariables;
const countries = require("./countries.json");
const express = require("express");
const cors = require("cors");
const amqp = require("amqplib/callback_api");
const Amadeus = require("amadeus");
const app = express();
const axios = require("axios").default;
const {
	getPastDate,
	calculateContaminationRate,
	processLineByLine,
} = require("./utils");
const { queueRecommendation } = require("./rabbit_utils");

app.use(express.json());
app.use(cors());
app.listen(PORT, () => console.log("Server started at %s", PORT));

const covidApi = "https://corona.lmao.ninja/v2/historical";

let countriesByIata = {};
let covidData = [];

const amadeus = new Amadeus({
	clientId: AMADEUS_CLIENT_ID,
	clientSecret: AMADEUS_CLIENT_SECRET,
});

app.get("/countries", async function (req, res) {
	const iata = req.query.iata;
	const cheapestFlight = await getCheapestFlightDestinations(iata);
	const cheapestFlightWithCountryCode =
		setDestinationCountryCode(cheapestFlight);
	const response = JSON.stringify(cheapestFlightWithCountryCode);

	res.status(200).send(response);
});

const getCovidHistoricalData = async (days) => {
	await axios({
		method: "get",
		url: `${covidApi}`,
		params: {
			lastdays: 90,
		},
	}).then((response) => {
		covidData = response.data;
		sendCovidData(days);
	});
};

const getCheapestFlightDestinations = async (iata) => {
	try {
		const response = await amadeus.shopping.flightDestinations.get({
			origin: iata,
		});

		const handledDestinations = await handleCheapestFlightDestinations(
			response
		);

		return handledDestinations;
	} catch (err) {
		console.log(err);
		// getCheapestFlightDestinations(iata); //Ver isso
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

const setDestinationCountryCode = (cheapestFlights) => {
	const rawFlightDestinations = cheapestFlights?.map((destination) => ({
		...destination,
		countryCode: countriesByIata[destination.destinationIata],
		flag_link: `https://www.countryflags.io/${
			countriesByIata[destination.destinationIata]
		}/flat/64.png`,
		countryName: countries.find((element) => {
			return element.code == countriesByIata[destination.destinationIata];
		}).name,
	}));

	let countriesCodes = [];
	let finalDestinationsList = [];

	rawFlightDestinations?.forEach((destination) => {
		if (!countriesCodes.includes(destination.countryCode)) {
			countriesCodes.push(destination.countryCode);
			finalDestinationsList.push(destination);
		}
	});

	return finalDestinationsList;
};

const sendRecommendationsToQueue = (data) => {
	const bufferedMessage = Buffer.from(JSON.stringify(data));
	queueRecommendation(bufferedMessage);
};

const sendCovidData = (days) => {
	const formattedData = formatCovidData(covidData, days);
	sendRecommendationsToQueue(formattedData);
};

const formatCovidData = (data, days) => {
	let formatted = {};

	data.forEach((country) => {
		formatted[country.country] = {
			cases: country.timeline.cases[getPastDate(days)],
			contaminationRate: calculateContaminationRate(
				days,
				country.timeline.cases
			),
		};
	});

	return formatted;
};

const main = async () => {
	let days = 90;

	try {
		await processLineByLine("./airports.csv", (line) => {
			const [, iso_country, , iata_code] = line.split(",");
			countriesByIata[iata_code] = iso_country;
		});

		setInterval(async () => {
			if (days <= 0) {
				days = 90;
			} else {
				days -= 1;
			}
			console.log(days);
			if (covidData.length) {
				sendCovidData(days);
			} else {
				await getCovidHistoricalData(days);
			}
		}, 15000);
	} catch (err) {
		console.error(err);
	}
};

main();
