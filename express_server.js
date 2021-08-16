require("dotenv").config();

const envVariables = process.env;
const { AMADEUS_CLIENT_ID, AMADEUS_CLIENT_SECRET, PORT } = envVariables;

const express = require("express");
const cors = require("cors");
const amqp = require("amqplib/callback_api");
const Amadeus = require("amadeus");
// const fs = require("fs");
// const readline = require("readline");
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

//TIRAR VARIÁVEIS GLOBAIS
let cheapestFlightDestinations = [];
let countriesByIata = {};
let covidData = [];
let days = 90;

const amadeus = new Amadeus({
  clientId: AMADEUS_CLIENT_ID,
  clientSecret: AMADEUS_CLIENT_SECRET,
});

app.post("/", function (req, res) {
  const iata = req.body.iata_from;

  main(iata);
  res.sendStatus(200);
});

const getCovidHistoricalData = async (countriesName) => {
  if (!covidData.length) {
    await axios({
      method: "get",
      url: `${covidApi}/${countriesName}`,
      params: {
        lastdays: 90,
      },
    }).then(function (response) {
      covidData = response.data;
    });
  }

  covidData.forEach((countryObject, index) => {
    let cases_list = countryObject.timeline.cases;
    cheapestFlightDestinations[index].cases = cases_list[getPastDate(days)];
    cheapestFlightDestinations[index].contamination_rate =
      calculateContaminationRate(days, cases_list);
    cheapestFlightDestinations[index].country_name = countryObject.country;
    cheapestFlightDestinations[
      index
    ].flag_link = `https://www.countryflags.io/${cheapestFlightDestinations[index].countryCode}/flat/64.png`;
  });

  days -= 1;
};

const getCheapestFlightDestinations = async (iata) => {
  try {
    console.log("Making an api request...");

    const response = await amadeus.shopping.flightDestinations.get({
      origin: iata ?? "BSB",
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

const setDestinationCountryCode = () => {
  const rawFlightDestinations = cheapestFlightDestinations.map(
    (destination) => ({
      ...destination,
      countryCode: countriesByIata?.[destination.destinationIata]?.countryCode,
    })
  );

  let countriesCodes = [];
  let finalDestinationsList = [];

  rawFlightDestinations.forEach((destination) => {
    if (!countriesCodes.includes(destination.countryCode)) {
      countriesCodes.push(destination.countryCode);
      finalDestinationsList.push(destination);
    }
  });

  cheapestFlightDestinations = finalDestinationsList;
};

const sendRecommendationsToQueue = () => {
  const bufferedMessage = Buffer.from(
    JSON.stringify(cheapestFlightDestinations)
  );
  queueRecommendation(bufferedMessage);
};

const sendFlightRecommendation = async (iata) => {
  await getCheapestFlightDestinations(iata);

  if (
    cheapestFlightDestinations.length &&
    Object.keys(countriesByIata).length
  ) {
    setDestinationCountryCode();
    const countriesIso = cheapestFlightDestinations
      .map((destination) => {
        return destination.countryCode;
      })
      .join(",");

    await getCovidHistoricalData(countriesIso);
    sendRecommendationsToQueue();
  }
};

const main = async (iata) => {
  try {
    await processLineByLine("./airports.csv", (line) => {
      const [, iso_country, , iata_code] = line.split(",");
      countriesByIata[iata_code] = iso_country;
    });

    setInterval(async function () {
      await sendFlightRecommendation(iata);
    }, 15000);
  } catch (err) {
    console.error(err);
  }
};
